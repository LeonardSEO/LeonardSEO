import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const START_MARKER = '<!-- PINNED-REPOS:START -->';
const END_MARKER = '<!-- PINNED-REPOS:END -->';
const readmePath = process.env.README_PATH || 'README.md';
const username = process.env.PINNED_USER || process.env.GITHUB_REPOSITORY_OWNER || 'LeonardSEO';

const query = `
  query PinnedRepositories($login: String!) {
    user(login: $login) {
      pinnedItems(first: 6, types: REPOSITORY) {
        nodes {
          ... on Repository {
            name
            url
            description
          }
        }
      }
    }
  }
`;

function escapeTableCell(value) {
  return (value || 'No repository description provided.')
    .replaceAll('\\', '\\\\')
    .replaceAll('|', '\\|')
    .replaceAll(/\r?\n/g, ' ')
    .trim();
}

function fetchPinnedRepositories() {
  const response = execFileSync(
    'gh',
    [
      'api',
      'graphql',
      '-f',
      `query=${query}`,
      '-F',
      `login=${username}`,
    ],
    { encoding: 'utf8' },
  );
  const payload = JSON.parse(response);

  if (payload.errors?.length) {
    throw new Error(`GitHub GraphQL error: ${JSON.stringify(payload.errors)}`);
  }
  if (!payload.data?.user) {
    throw new Error(`GitHub user not found: ${username}`);
  }

  return payload.data.user.pinnedItems.nodes.filter(Boolean);
}

function renderPinnedBlock(repositories) {
  const lines = [
    START_MARKER,
    '_Automatically synced with the repositories pinned on my GitHub profile._',
    '',
  ];

  if (repositories.length === 0) {
    lines.push('No repositories are pinned right now.');
  } else {
    lines.push('| Repository | Description |', '|---|---|');
    for (const repository of repositories) {
      lines.push(
        `| [\`${escapeTableCell(repository.name)}\`](${repository.url}) | ${escapeTableCell(repository.description)} |`,
      );
    }
  }

  lines.push(END_MARKER);
  return lines.join('\n');
}

function replaceGeneratedBlock(readme, generatedBlock) {
  const start = readme.indexOf(START_MARKER);
  const end = readme.indexOf(END_MARKER);

  if (start === -1 || end === -1 || end < start) {
    throw new Error(`README must contain one ${START_MARKER} / ${END_MARKER} block.`);
  }
  if (readme.indexOf(START_MARKER, start + START_MARKER.length) !== -1) {
    throw new Error(`README contains more than one ${START_MARKER} marker.`);
  }

  return `${readme.slice(0, start)}${generatedBlock}${readme.slice(end + END_MARKER.length)}`;
}

const currentReadme = readFileSync(readmePath, 'utf8');
const repositories = fetchPinnedRepositories();
const nextReadme = replaceGeneratedBlock(currentReadme, renderPinnedBlock(repositories));

if (nextReadme === currentReadme) {
  console.log(`Pinned repositories are already current for @${username}.`);
} else if (process.argv.includes('--check')) {
  console.error(`Pinned repositories are out of date for @${username}.`);
  process.exitCode = 1;
} else {
  writeFileSync(readmePath, nextReadme);
  console.log(`Updated ${repositories.length} pinned repositories for @${username}.`);
}
