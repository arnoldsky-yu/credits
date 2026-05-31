import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { countIssues, formatIssue, readSiteProfilesIndex, validateExportPayload } from './validate.mjs';

const config = {
  spreadsheetId: 'spreadsheet-id',
  sheets: [
    {
      title: 'appearances',
      columns: [
        { name: 'event_id' },
        { name: 'role_group_zh' },
        { name: 'role_group_en' },
        { name: 'role_title_zh' },
        { name: 'role_title_en' },
        { name: 'display_name_at_event' },
        { name: 'github_username' },
        { name: 'source_url_override' },
        { name: 'notes' },
      ],
    },
    {
      title: 'events',
      columns: [
        { name: 'event_id' },
        { name: 'event_series' },
        { name: 'event_name_zh' },
        { name: 'event_name_en' },
        { name: 'event_year' },
        { name: 'official_site_url' },
        { name: 'staff_source_url' },
        { name: 'speaker_source_url' },
        { name: 'notes' },
      ],
    },
    {
      title: 'people',
      columns: [
        { name: 'github_username' },
        { name: 'display_name' },
      ],
    },
  ],
};

function basePayload(overrides = {}) {
  return {
    spreadsheetId: 'spreadsheet-id',
    exportedAt: '2026-05-29T00:00:00.000Z',
    sheets: {
      appearances: {
        columns: config.sheets[0].columns.map((column) => column.name),
        rows: [
          {
            _row: 2,
            event_id: 'SITCON-2026',
            role_group_zh: '行政組',
            role_group_en: '',
            role_title_zh: '組員',
            role_title_en: '',
            display_name_at_event: 'Alice',
            github_username: 'alice',
            source_url_override: '',
            notes: '',
          },
        ],
      },
      events: {
        columns: config.sheets[1].columns.map((column) => column.name),
        rows: [
          {
            _row: 2,
            event_id: 'SITCON-2026',
            event_series: 'SITCON',
            event_name_zh: 'SITCON 2026',
            event_name_en: '',
            event_year: '2026',
            official_site_url: 'https://sitcon.org/2026/',
            staff_source_url: 'https://sitcon.org/2026/team',
            speaker_source_url: '',
            notes: '',
          },
        ],
      },
      people: {
        columns: config.sheets[2].columns.map((column) => column.name),
        rows: [
          {
            _row: 2,
            github_username: 'alice',
            display_name: 'Alice',
          },
        ],
      },
    },
    ...overrides,
  };
}

async function makeSiteProfilesDir(eventId, sourcePersonId, profile) {
  const dir = await mkdtemp(path.join(tmpdir(), 'sitcon-site-profiles-'));
  const eventDir = path.join(dir, eventId);
  await mkdir(eventDir, { recursive: true });
  await writeFile(path.join(eventDir, `${sourcePersonId}.json`), `${JSON.stringify(profile, null, 2)}\n`);
  return dir;
}

async function readSiteProfiles(eventId = 'SITCON-2026', sourcePersonId = 'speaker-1', profile = {
  display_name: 'Site Speaker',
  avatar_url: 'https://example.com/avatar.png',
}) {
  return readSiteProfilesIndex(await makeSiteProfilesDir(eventId, sourcePersonId, profile), { required: true });
}

test('validateExportPayload accepts a minimal valid export', () => {
  const issues = validateExportPayload(basePayload(), config);

  assert.deepEqual(countIssues(issues), { error: 0, warning: 0 });
});

test('validateExportPayload treats missing people profile as a warning', () => {
  const payload = basePayload();
  payload.sheets.appearances.rows[0].github_username = 'new-user';

  const issues = validateExportPayload(payload, config);

  assert.deepEqual(countIssues(issues), { error: 0, warning: 2 });
  assert(issues.some((issue) => issue.sheet === 'appearances' && issue.field === 'github_username'));
  assert(issues.some((issue) => issue.sheet === 'people' && issue.field === 'github_username'));
});

test('validateExportPayload accepts site profile references with matching site profile files', async () => {
  const payload = basePayload();
  payload.sheets.appearances.rows[0].github_username = 'site:speaker-1';
  const siteProfiles = await readSiteProfiles();

  const issues = validateExportPayload(payload, config, { siteProfiles });

  assert.deepEqual(countIssues(issues), { error: 0, warning: 1 });
  assert(issues.every((issue) => issue.sheet !== 'appearances' || issue.field !== 'github_username'));
  assert(issues.some((issue) => issue.sheet === 'people' && issue.field === 'github_username'));
});

test('validateExportPayload rejects site profile references without matching files', async () => {
  const payload = basePayload();
  payload.sheets.appearances.rows[0].github_username = 'site:speaker-1';
  const siteProfiles = await readSiteProfiles('SITCON-2026', 'other-speaker');

  const issues = validateExportPayload(payload, config, { siteProfiles });

  assert.equal(countIssues(issues).error, 1);
  assert(issues.some((issue) => issue.message.includes('was not found for event_id "SITCON-2026"')));
});

test('validateExportPayload rejects invalid site profile file content', async () => {
  const payload = basePayload();
  payload.sheets.appearances.rows[0].github_username = 'site:speaker-1';
  const siteProfiles = await readSiteProfiles('SITCON-2026', 'speaker-1', {
    display_name: '',
    avatar_url: 'http://example.com/avatar.png',
    bio: 'not allowed',
  });

  const issues = validateExportPayload(payload, config, { siteProfiles });

  assert.equal(countIssues(issues).error, 3);
  assert(issues.some((issue) => issue.message.includes('unsupported field "bio"')));
  assert(issues.some((issue) => issue.message.includes('display_name must not be blank')));
  assert(issues.some((issue) => issue.message.includes('avatar_url must use https:')));
});

test('validateExportPayload rejects malformed site profile references', () => {
  const payload = basePayload();
  payload.sheets.appearances.rows[0].github_username = 'site:';

  const issues = validateExportPayload(payload, config);

  assert.equal(countIssues(issues).error, 1);
  assert(issues.some((issue) => issue.message.includes('site:<lowercase-source-person-id>')));
});

test('validateExportPayload rejects unknown profile reference prefixes', () => {
  const payload = basePayload();
  payload.sheets.appearances.rows[0].github_username = 'speaker:alice';

  const issues = validateExportPayload(payload, config);

  assert.equal(countIssues(issues).error, 1);
  assert(issues.some((issue) => issue.message.includes('unknown profile reference prefix')));
});

test('validateExportPayload reports source and relation errors', () => {
  const payload = basePayload();
  payload.sheets.appearances.rows[0].event_id = 'missing-event';
  payload.sheets.appearances.rows[0].source_url_override = 'ftp://example.com';
  payload.sheets.events.rows[0].event_year = '26';
  payload.sheets.events.rows.push({ ...payload.sheets.events.rows[0], _row: 3, event_year: '2026' });

  const issues = validateExportPayload(payload, config);

  assert.equal(countIssues(issues).error, 4);
  assert(issues.some((issue) => issue.message.includes('does not exist in events')));
  assert(issues.some((issue) => issue.message.includes('duplicate event_id')));
  assert(issues.some((issue) => issue.message.includes('four-digit year')));
  assert(issues.some((issue) => issue.message.includes('must use http: or https:')));
});

test('validateExportPayload warns on classification labels and private contacts', () => {
  const payload = basePayload();
  payload.sheets.appearances.rows[0].role_group_en = 'staff';
  payload.sheets.appearances.rows[0].notes = 'call 0912-345-678';

  const issues = validateExportPayload(payload, config);

  assert.equal(countIssues(issues).warning, 2);
  assert(issues.some((issue) => issue.field === 'role_group_en'));
  assert(issues.some((issue) => issue.field === 'notes'));
});

test('formatIssue includes sheet row and field context', () => {
  assert.equal(
    formatIssue({
      level: 'error',
      sheet: 'appearances',
      row: 5,
      field: 'event_id',
      message: 'required field is blank',
    }),
    'ERROR appearances!row 5 event_id: required field is blank',
  );
});
