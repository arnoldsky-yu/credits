import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import {
  collectProfilePeopleRows,
  formatPlan,
  mergePeopleRows,
  parseArgs,
  validatePeopleSheetConfig,
} from './sync-people.mjs';

test('parseArgs accepts dry-run, config, and profiles directory paths', () => {
  assert.deepEqual(parseArgs(['--dry-run', '--config=custom.json', '--profiles-dir', 'profiles']), {
    configPath: 'custom.json',
    dryRun: true,
    profilesDir: 'profiles',
  });
});

test('collectProfilePeopleRows reads profile usernames and display names', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'sitcon-sync-people-'));
  await writeFile(path.join(dir, '_template.json'), '{}\n');
  await writeFile(path.join(dir, 'Bob.json'), '{"display_name":"Bob"}\n');
  await writeFile(path.join(dir, 'alice.json'), '{"display_name":""}\n');

  assert.deepEqual(await collectProfilePeopleRows(dir), [
    { github_username: 'alice', display_name: '' },
    { github_username: 'Bob', display_name: 'Bob' },
  ]);
});

test('validatePeopleSheetConfig requires the generated helper shape', () => {
  assert.doesNotThrow(() => validatePeopleSheetConfig({
    spreadsheetId: 'spreadsheet-id',
    sheets: [
      {
        title: 'people',
        columns: [{ name: 'github_username' }, { name: 'display_name' }],
      },
    ],
  }));

  assert.throws(() => validatePeopleSheetConfig({
    spreadsheetId: 'spreadsheet-id',
    sheets: [
      {
        title: 'people',
        columns: [{ name: 'display_name' }, { name: 'github_username' }],
      },
    ],
  }), /people sheet columns/);
});

test('formatPlan summarizes rows without inventing profile details', () => {
  assert.equal(formatPlan([
    { github_username: 'alice', display_name: '' },
  ]), 'People rows: 1\n- alice: ');
});

test('mergePeopleRows upserts profile rows without deleting pending people rows', () => {
  assert.deepEqual(mergePeopleRows([
    { github_username: 'pending-user', display_name: 'Pending' },
    { github_username: 'alice', display_name: '' },
  ], [
    { github_username: 'Alice', display_name: 'Alice Profile' },
    { github_username: 'bob', display_name: '' },
  ]), [
    { github_username: 'Alice', display_name: 'Alice Profile' },
    { github_username: 'bob', display_name: '' },
    { github_username: 'pending-user', display_name: 'Pending' },
  ]);
});
