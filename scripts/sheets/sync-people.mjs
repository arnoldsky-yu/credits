import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { getServiceAccountAccessToken } from '../lib/google-auth.mjs';
import { SHEETS_API, sheetsFetch } from '../lib/google-sheets-api.mjs';
import { DEFAULT_CONFIG_PATH, getColumnNames, quoteSheetName, readSheetsConfig } from '../lib/sheets-config.mjs';

const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const DEFAULT_PROFILES_DIR = 'tmp/credits-profiles/profiles';
const PEOPLE_COLUMNS = ['github_username', 'display_name'];
const GITHUB_USERNAME_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;

export async function main(argv = process.argv.slice(2), env = process.env) {
  const options = parseArgs(argv);
  const [config, rows] = await Promise.all([
    readSheetsConfig(options.configPath),
    collectProfilePeopleRows(options.profilesDir),
  ]);
  validatePeopleSheetConfig(config);

  if (options.dryRun) {
    console.log(formatPlan(rows));
    return;
  }

  const accessToken = await getServiceAccountAccessToken(env.GOOGLE_APPLICATION_CREDENTIALS, SCOPE);
  const syncedRows = await syncPeopleSheet(config, rows, accessToken);
  console.log(`Synced ${rows.length} profile usernames to people; people now has ${syncedRows.length} rows.`);
}

export function parseArgs(argv) {
  const options = {
    configPath: DEFAULT_CONFIG_PATH,
    dryRun: false,
    profilesDir: DEFAULT_PROFILES_DIR,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (arg === '--config') {
      options.configPath = readNextArg(argv, index, '--config');
      index += 1;
      continue;
    }
    if (arg.startsWith('--config=')) {
      options.configPath = readInlineArg(arg, '--config');
      continue;
    }
    if (arg === '--profiles-dir') {
      options.profilesDir = readNextArg(argv, index, '--profiles-dir');
      index += 1;
      continue;
    }
    if (arg.startsWith('--profiles-dir=')) {
      options.profilesDir = readInlineArg(arg, '--profiles-dir');
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function readNextArg(argv, index, name) {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${name} requires a value.`);
  }
  return value;
}

function readInlineArg(arg, name) {
  const value = arg.slice(`${name}=`.length);
  if (!value) {
    throw new Error(`${name} requires a value.`);
  }
  return value;
}

export async function collectProfilePeopleRows(profilesDir) {
  const entries = await readdir(profilesDir, { withFileTypes: true });
  const rows = [];
  const seen = new Set();

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json') || entry.name.startsWith('_')) {
      continue;
    }

    const username = path.basename(entry.name, '.json');
    if (!GITHUB_USERNAME_PATTERN.test(username)) {
      throw new Error(`profile filename "${entry.name}" is not a valid GitHub username file.`);
    }

    const normalized = username.toLowerCase();
    if (seen.has(normalized)) {
      throw new Error(`profile filename "${entry.name}" duplicates another GitHub username case-insensitively.`);
    }
    seen.add(normalized);

    const profile = JSON.parse(await readFile(path.join(profilesDir, entry.name), 'utf8'));
    rows.push({
      github_username: username,
      display_name: typeof profile.display_name === 'string' ? profile.display_name : '',
    });
  }

  return rows.sort((left, right) => left.github_username.toLowerCase().localeCompare(right.github_username.toLowerCase()));
}

export function validatePeopleSheetConfig(config) {
  const peopleSheet = config.sheets.find((sheet) => sheet.title === 'people');
  if (!peopleSheet) {
    throw new Error('config is missing the people sheet.');
  }
  const columns = getColumnNames(peopleSheet);
  if (columns.join(',') !== PEOPLE_COLUMNS.join(',')) {
    throw new Error(`people sheet columns must be exactly: ${PEOPLE_COLUMNS.join(', ')}`);
  }
}

export function formatPlan(rows) {
  const lines = [`People rows: ${rows.length}`];
  for (const row of rows) {
    lines.push(`- ${row.github_username}: ${row.display_name}`);
  }
  return lines.join('\n');
}

export async function syncPeopleSheet(config, rows, accessToken) {
  const existingRows = await fetchPeopleSheetRows(config, accessToken);
  const mergedRows = mergePeopleRows(existingRows, rows);
  const range = `${quoteSheetName('people')}!A:B`;
  await sheetsFetch(`${SHEETS_API}/${config.spreadsheetId}/values/${encodeURIComponent(range)}:clear`, accessToken, {
    method: 'POST',
    body: '{}',
  });

  const values = [
    PEOPLE_COLUMNS,
    ...mergedRows.map((row) => [row.github_username, row.display_name]),
  ];
  const updateRange = `${quoteSheetName('people')}!A1:B${values.length}`;
  await sheetsFetch(
    `${SHEETS_API}/${config.spreadsheetId}/values/${encodeURIComponent(updateRange)}?valueInputOption=RAW`,
    accessToken,
    {
      method: 'PUT',
      body: JSON.stringify({
        range: updateRange,
        majorDimension: 'ROWS',
        values,
      }),
    },
  );

  return mergedRows;
}

export async function fetchPeopleSheetRows(config, accessToken) {
  const range = `${quoteSheetName('people')}!A1:B`;
  const response = await sheetsFetch(`${SHEETS_API}/${config.spreadsheetId}/values/${encodeURIComponent(range)}`, accessToken);
  const values = response.values ?? [];
  const [header = [], ...bodyRows] = values;
  if (header.join(',') !== PEOPLE_COLUMNS.join(',')) {
    throw new Error(`people sheet header must be exactly: ${PEOPLE_COLUMNS.join(', ')}`);
  }

  return bodyRows
    .map((row) => ({
      github_username: String(row[0] ?? '').trim(),
      display_name: String(row[1] ?? '').trim(),
    }))
    .filter((row) => row.github_username !== '');
}

export function mergePeopleRows(existingRows, profileRows) {
  const rowsByUsername = new Map();

  for (const row of existingRows) {
    const username = String(row.github_username ?? '').trim();
    if (username === '') {
      continue;
    }
    validateGithubUsername(username);
    rowsByUsername.set(username.toLowerCase(), {
      github_username: username,
      display_name: String(row.display_name ?? '').trim(),
    });
  }

  for (const row of profileRows) {
    const username = String(row.github_username ?? '').trim();
    validateGithubUsername(username);
    rowsByUsername.set(username.toLowerCase(), {
      github_username: username,
      display_name: String(row.display_name ?? '').trim(),
    });
  }

  return [...rowsByUsername.values()]
    .sort((left, right) => left.github_username.toLowerCase().localeCompare(right.github_username.toLowerCase()));
}

function validateGithubUsername(username) {
  if (!GITHUB_USERNAME_PATTERN.test(username)) {
    throw new Error(`github_username "${username}" is not a valid GitHub username.`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
