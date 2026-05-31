import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildBatchGetUrl,
  buildExportPayload,
  normalizeSheetRows,
  parseArgs,
  sheetTitleFromRange,
  toCsv,
} from './export.mjs';

const config = {
  spreadsheetId: 'spreadsheet-id',
  sheets: [
    {
      title: 'appearances',
      columns: [
        { name: 'event_id' },
        { name: 'display_name_at_event' },
        { name: 'notes' },
      ],
    },
    {
      title: "people's sheet",
      columns: [{ name: 'github_username' }],
    },
  ],
};

test('parseArgs accepts separated and inline option values', () => {
  assert.deepEqual(parseArgs(['--dry-run', '--config', 'custom.json', '--output-dir', 'out']), {
    configPath: 'custom.json',
    dryRun: true,
    outputDir: 'out',
  });
  assert.deepEqual(parseArgs(['--output-dir=out']), {
    configPath: 'config/sheets.json',
    dryRun: false,
    outputDir: 'out',
  });
});

test('buildBatchGetUrl quotes sheet titles and requests rows', () => {
  const url = new URL(buildBatchGetUrl(config));

  assert.equal(url.pathname, '/v4/spreadsheets/spreadsheet-id/values:batchGet');
  assert.deepEqual(url.searchParams.getAll('ranges'), [
    "'appearances'!A1:ZZ",
    "'people''s sheet'!A1:ZZ",
  ]);
  assert.equal(url.searchParams.get('majorDimension'), 'ROWS');
});

test('sheetTitleFromRange handles quoted Google Sheets ranges', () => {
  assert.equal(sheetTitleFromRange("'people''s sheet'!A1:B20"), "people's sheet");
  assert.equal(sheetTitleFromRange('appearances!A1:I20'), 'appearances');
});

test('normalizeSheetRows maps columns by header and trims blank rows', () => {
  const rows = normalizeSheetRows('appearances', ['event_id', 'display_name_at_event'], [
    ['display_name_at_event', 'ignored', 'event_id'],
    ['  Alice  ', 'x', ' SITCON-2026 '],
    ['', '', ''],
  ]);

  assert.deepEqual(rows, [
    {
      _row: 2,
      event_id: 'SITCON-2026',
      display_name_at_event: 'Alice',
    },
  ]);
});

test('normalizeSheetRows fails on missing or duplicate headers', () => {
  assert.throws(
    () => normalizeSheetRows('appearances', ['event_id'], []),
    /did not return a header row/,
  );
  assert.throws(
    () => normalizeSheetRows('appearances', ['event_id'], [['event_id', 'event_id']]),
    /duplicate header columns/,
  );
  assert.throws(
    () => normalizeSheetRows('appearances', ['event_id', 'name'], [['event_id']]),
    /missing expected header columns: name/,
  );
});

test('buildExportPayload normalizes every configured sheet', () => {
  const payload = buildExportPayload(config, [
    {
      range: "'appearances'!A1:C2",
      values: [
        ['event_id', 'display_name_at_event', 'notes'],
        ['SITCON-2026', 'Alice', ''],
      ],
    },
    {
      range: "'people''s sheet'!A1:A2",
      values: [
        ['github_username'],
        ['alice'],
      ],
    },
  ], '2026-05-29T00:00:00.000Z');

  assert.deepEqual(Object.keys(payload.sheets), ['appearances', "people's sheet"]);
  assert.equal(payload.sheets.appearances.rows[0].display_name_at_event, 'Alice');
});

test('toCsv quotes commas, quotes, and line breaks', () => {
  assert.equal(
    toCsv(['name', 'note'], [{ name: 'Alice, Bob', note: 'said "hi"\nnext' }]),
    'name,note\n"Alice, Bob","said ""hi""\nnext"\n',
  );
});
