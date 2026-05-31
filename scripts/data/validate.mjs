import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { DEFAULT_CONFIG_PATH, getColumnNames, readSheetsConfig } from '../lib/sheets-config.mjs';

const DEFAULT_EXPORT_PATH = 'tmp/sheets-export/export.json';
const DEFAULT_SITE_PROFILES_DIR = '../credits-profiles/site-profiles';
const GITHUB_USERNAME_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
const SITE_PROFILE_REF_PATTERN = /^site:[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const CLASSIFICATION_LABELS = new Set(['staff', 'speaker', '工作人員', '講者']);
const SITE_PROFILE_ALLOWED_KEYS = new Set(['display_name', 'avatar_url']);

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const [config, payload] = await Promise.all([
    readSheetsConfig(options.configPath),
    readJson(options.exportPath),
  ]);
  const siteProfiles = await readSiteProfilesIndex(
    options.siteProfilesDir ?? DEFAULT_SITE_PROFILES_DIR,
    { required: options.siteProfilesDirSpecified },
  );
  const issues = validateExportPayload(payload, config, { siteProfiles });
  printIssues(issues);

  const counts = countIssues(issues);
  if (counts.error > 0) {
    console.error(`Validation failed: ${counts.error} errors, ${counts.warning} warnings.`);
    process.exitCode = 1;
    return;
  }

  console.log(`Validation passed: ${counts.warning} warnings.`);
}

export function parseArgs(argv) {
  const options = {
    configPath: DEFAULT_CONFIG_PATH,
    exportPath: DEFAULT_EXPORT_PATH,
    siteProfilesDir: undefined,
    siteProfilesDirSpecified: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--config') {
      options.configPath = readNextArg(argv, index, '--config');
      index += 1;
      continue;
    }
    if (arg.startsWith('--config=')) {
      options.configPath = readInlineArg(arg, '--config');
      continue;
    }
    if (arg === '--export') {
      options.exportPath = readNextArg(argv, index, '--export');
      index += 1;
      continue;
    }
    if (arg.startsWith('--export=')) {
      options.exportPath = readInlineArg(arg, '--export');
      continue;
    }
    if (arg === '--site-profiles-dir') {
      options.siteProfilesDir = readNextArg(argv, index, '--site-profiles-dir');
      options.siteProfilesDirSpecified = true;
      index += 1;
      continue;
    }
    if (arg.startsWith('--site-profiles-dir=')) {
      options.siteProfilesDir = readInlineArg(arg, '--site-profiles-dir');
      options.siteProfilesDirSpecified = true;
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

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

export async function readSiteProfilesIndex(siteProfilesDir, options = { required: false }) {
  if (!siteProfilesDir) {
    return null;
  }

  try {
    await access(siteProfilesDir);
  } catch (error) {
    if (options.required) {
      throw new Error(`site profiles directory was not found: ${siteProfilesDir}`);
    }
    return null;
  }

  const profiles = new Map();
  const entries = await readdir(siteProfilesDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const eventId = entry.name;
    const eventDir = path.join(siteProfilesDir, eventId);
    const profileEntries = await readdir(eventDir, { withFileTypes: true });
    for (const profileEntry of profileEntries) {
      if (!profileEntry.isFile() || !profileEntry.name.endsWith('.json')) {
        continue;
      }

      const sourcePersonId = path.basename(profileEntry.name, '.json');
      const filePath = path.join(eventDir, profileEntry.name);
      let profile;
      try {
        profile = JSON.parse(await readFile(filePath, 'utf8'));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        profile = { __siteProfileReadError: `must contain valid JSON: ${message}` };
      }
      profiles.set(siteProfileKey(eventId, sourcePersonId), { filePath, profile });
    }
  }

  return profiles;
}

export function validateExportPayload(payload, config, options = {}) {
  const issues = [];
  validatePayloadEnvelope(issues, payload, config);

  const appearances = getRows(payload, config, 'appearances', issues);
  const events = getRows(payload, config, 'events', issues);
  const people = getRows(payload, config, 'people', issues);

  const eventsById = validateEvents(issues, events);
  const peopleByUsername = validatePeople(issues, people);
  validateAppearances(issues, appearances, eventsById, peopleByUsername, options.siteProfiles ?? null);
  validateUnusedPeople(issues, people, appearances);

  return issues;
}

function validatePayloadEnvelope(issues, payload, config) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    addIssue(issues, 'error', 'export', 0, '', 'export payload must be a JSON object');
    return;
  }
  if (payload.spreadsheetId && payload.spreadsheetId !== config.spreadsheetId) {
    addIssue(issues, 'error', 'export', 0, 'spreadsheetId', 'spreadsheetId does not match config');
  }
  if (!payload.sheets || typeof payload.sheets !== 'object' || Array.isArray(payload.sheets)) {
    addIssue(issues, 'error', 'export', 0, 'sheets', 'export payload must include sheets object');
  }
}

function getRows(payload, config, sheetName, issues) {
  const sheetConfig = config.sheets.find((sheet) => sheet.title === sheetName);
  if (!sheetConfig) {
    addIssue(issues, 'error', sheetName, 0, '', `config is missing required sheet "${sheetName}"`);
    return [];
  }

  const exportedSheet = payload?.sheets?.[sheetName];
  if (!exportedSheet || typeof exportedSheet !== 'object' || Array.isArray(exportedSheet)) {
    addIssue(issues, 'error', sheetName, 0, '', `missing exported sheet "${sheetName}"`);
    return [];
  }

  validateExportedColumns(issues, sheetName, getColumnNames(sheetConfig), exportedSheet.columns);

  if (!Array.isArray(exportedSheet.rows)) {
    addIssue(issues, 'error', sheetName, 0, 'rows', `exported sheet "${sheetName}" must include rows array`);
    return [];
  }

  return exportedSheet.rows.filter((row, index) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      addIssue(issues, 'error', sheetName, index + 2, '', 'row must be a JSON object');
      return false;
    }
    return true;
  });
}

function validateExportedColumns(issues, sheetName, expectedColumns, actualColumns) {
  if (!Array.isArray(actualColumns)) {
    addIssue(issues, 'error', sheetName, 0, 'columns', `exported sheet "${sheetName}" must include columns array`);
    return;
  }

  const expected = expectedColumns.join(',');
  const actual = actualColumns.join(',');
  if (actual !== expected) {
    addIssue(issues, 'error', sheetName, 0, 'columns', 'exported columns do not match config order');
  }
}

function validateEvents(issues, events) {
  const eventsById = new Map();

  for (const event of events) {
    requireField(issues, 'events', event, 'event_id');
    requireField(issues, 'events', event, 'event_series');
    requireField(issues, 'events', event, 'event_name_zh');
    requireField(issues, 'events', event, 'event_year');

    if (event.event_id) {
      if (eventsById.has(event.event_id)) {
        addIssue(issues, 'error', 'events', rowNumber(event), 'event_id', `duplicate event_id "${event.event_id}"`);
      } else {
        eventsById.set(event.event_id, event);
      }
    }

    if (event.event_year && !/^\d{4}$/.test(event.event_year)) {
      addIssue(issues, 'error', 'events', rowNumber(event), 'event_year', 'event_year must be a four-digit year');
    }

    validateUrl(issues, 'events', event, 'official_site_url', { required: true, protocols: ['http:', 'https:'] });
    validateUrl(issues, 'events', event, 'staff_source_url', { required: false, protocols: ['http:', 'https:'] });
    validateUrl(issues, 'events', event, 'speaker_source_url', { required: false, protocols: ['http:', 'https:'] });

    if (!event.staff_source_url && !event.speaker_source_url) {
      addIssue(
        issues,
        'warning',
        'events',
        rowNumber(event),
        'staff_source_url',
        'neither staff_source_url nor speaker_source_url is set',
      );
    }
    warnPrivateContact(issues, 'events', event, 'notes');
  }

  return eventsById;
}

function validatePeople(issues, people) {
  const peopleByUsername = new Map();

  for (const person of people) {
    requireField(issues, 'people', person, 'github_username');
    if (!person.github_username) {
      continue;
    }

    const normalizedUsername = normalizeGithubUsername(person.github_username);
    if (!isLikelyGithubUsername(person.github_username)) {
      addIssue(issues, 'warning', 'people', rowNumber(person), 'github_username', 'value does not match GitHub username syntax');
    }
    if (peopleByUsername.has(normalizedUsername)) {
      addIssue(
        issues,
        'error',
        'people',
        rowNumber(person),
        'github_username',
        `duplicate github_username "${person.github_username}"`,
      );
    } else {
      peopleByUsername.set(normalizedUsername, person);
    }
    warnPrivateContact(issues, 'people', person, 'display_name');
  }

  return peopleByUsername;
}

function validateAppearances(issues, appearances, eventsById, peopleByUsername, siteProfiles) {
  for (const appearance of appearances) {
    requireField(issues, 'appearances', appearance, 'event_id');
    requireField(issues, 'appearances', appearance, 'role_group_zh');
    requireField(issues, 'appearances', appearance, 'role_title_zh');
    requireField(issues, 'appearances', appearance, 'display_name_at_event');

    if (appearance.event_id && !eventsById.has(appearance.event_id)) {
      addIssue(
        issues,
        'error',
        'appearances',
        rowNumber(appearance),
        'event_id',
        `event_id "${appearance.event_id}" does not exist in events`,
      );
    }

    validateUrl(issues, 'appearances', appearance, 'source_url_override', {
      required: false,
      protocols: ['http:', 'https:'],
    });

    if (appearance.github_username) {
      const profileRef = parseProfileReference(appearance.github_username);
      if (profileRef.type === 'site') {
        validateSiteProfileReference(issues, appearance, profileRef, siteProfiles);
      } else if (profileRef.type === 'invalid') {
        addIssue(
          issues,
          'error',
          'appearances',
          rowNumber(appearance),
          'github_username',
          profileRef.message,
        );
      } else if (profileRef.type === 'invalid-github') {
        addIssue(
          issues,
          'warning',
          'appearances',
          rowNumber(appearance),
          'github_username',
          profileRef.message,
        );
      } else if (!peopleByUsername.has(normalizeGithubUsername(profileRef.value))) {
        addIssue(
          issues,
          'warning',
          'appearances',
          rowNumber(appearance),
          'github_username',
          `profile username "${profileRef.value}" is not present in people yet`,
        );
      }
    }

    warnRoleClassificationLabel(issues, appearance, 'role_group_zh');
    warnRoleClassificationLabel(issues, appearance, 'role_group_en');
    warnPrivateContact(issues, 'appearances', appearance, 'display_name_at_event');
    warnPrivateContact(issues, 'appearances', appearance, 'notes');
  }
}

function validateSiteProfileReference(issues, appearance, profileRef, siteProfiles) {
  if (!siteProfiles) {
    return;
  }

  const eventId = String(appearance.event_id ?? '').trim();
  const key = siteProfileKey(eventId, profileRef.value);
  const entry = siteProfiles.get(key);
  if (!entry) {
    addIssue(
      issues,
      'error',
      'appearances',
      rowNumber(appearance),
      'github_username',
      `site profile "${profileRef.value}" was not found for event_id "${eventId}"`,
    );
    return;
  }

  validateSiteProfileObject(issues, appearance, profileRef, entry.profile);
}

function validateSiteProfileObject(issues, appearance, profileRef, profile) {
  const location = `site profile "${profileRef.value}"`;
  if (profile?.__siteProfileReadError) {
    addIssue(issues, 'error', 'appearances', rowNumber(appearance), 'github_username', `${location} ${profile.__siteProfileReadError}`);
    return;
  }
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    addIssue(issues, 'error', 'appearances', rowNumber(appearance), 'github_username', `${location} must be a JSON object`);
    return;
  }

  for (const key of Object.keys(profile)) {
    if (!SITE_PROFILE_ALLOWED_KEYS.has(key)) {
      addIssue(issues, 'error', 'appearances', rowNumber(appearance), 'github_username', `${location} has unsupported field "${key}"`);
    }
  }

  validateSiteProfileString(issues, appearance, profileRef, profile, 'display_name', { required: true, allowBlank: false });
  validateSiteProfileString(issues, appearance, profileRef, profile, 'avatar_url', { required: true, allowBlank: true, url: true });
}

function validateSiteProfileString(issues, appearance, profileRef, profile, field, options) {
  const value = profile[field];
  const location = `site profile "${profileRef.value}" ${field}`;
  if (value === undefined) {
    if (options.required) {
      addIssue(issues, 'error', 'appearances', rowNumber(appearance), 'github_username', `${location} is required`);
    }
    return;
  }
  if (typeof value !== 'string') {
    addIssue(issues, 'error', 'appearances', rowNumber(appearance), 'github_username', `${location} must be a string`);
    return;
  }
  if (!options.allowBlank && value.trim() === '') {
    addIssue(issues, 'error', 'appearances', rowNumber(appearance), 'github_username', `${location} must not be blank`);
  }
  if (options.url && value !== '') {
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:') {
        addIssue(issues, 'error', 'appearances', rowNumber(appearance), 'github_username', `${location} must use https:`);
      }
    } catch {
      addIssue(issues, 'error', 'appearances', rowNumber(appearance), 'github_username', `${location} must be a valid URL`);
    }
  }
}

function validateUnusedPeople(issues, people, appearances) {
  const usedGithubUsernames = new Set(
    appearances
      .map((appearance) => appearance.github_username)
      .filter(Boolean)
      .map((value) => parseProfileReference(value))
      .filter((profileRef) => profileRef.type === 'github')
      .map((profileRef) => normalizeGithubUsername(profileRef.value)),
  );

  for (const person of people) {
    if (person.github_username && !usedGithubUsernames.has(normalizeGithubUsername(person.github_username))) {
      addIssue(
        issues,
        'warning',
        'people',
        rowNumber(person),
        'github_username',
        `profile username "${person.github_username}" is not used by any appearance`,
      );
    }
  }
}

function requireField(issues, sheet, row, field) {
  if (!row[field]) {
    addIssue(issues, 'error', sheet, rowNumber(row), field, 'required field is blank');
  }
}

function validateUrl(issues, sheet, row, field, options) {
  const value = row[field];
  if (!value) {
    if (options.required) {
      addIssue(issues, 'error', sheet, rowNumber(row), field, 'required URL is blank');
    }
    return;
  }

  try {
    const url = new URL(value);
    if (!options.protocols.includes(url.protocol)) {
      addIssue(issues, 'error', sheet, rowNumber(row), field, `must use ${options.protocols.join(' or ')}`);
    }
  } catch {
    addIssue(issues, 'error', sheet, rowNumber(row), field, 'must be a valid URL');
  }
}

function warnRoleClassificationLabel(issues, appearance, field) {
  const value = String(appearance[field] ?? '').trim().toLowerCase();
  if (CLASSIFICATION_LABELS.has(value)) {
    addIssue(
      issues,
      'warning',
      'appearances',
      rowNumber(appearance),
      field,
      'role group should be a public group or session-type label, not a staff/speaker classification',
    );
  }
}

function warnPrivateContact(issues, sheet, row, field) {
  if (containsPrivateContact(row[field])) {
    addIssue(issues, 'warning', sheet, rowNumber(row), field, 'may contain private contact information');
  }
}

function containsPrivateContact(value) {
  if (!value) {
    return false;
  }
  return /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(value) || /(?:\+?\d[\s-]?){8,}/.test(value);
}

function isLikelyGithubUsername(value) {
  return GITHUB_USERNAME_PATTERN.test(value);
}

function isSiteProfileReference(value) {
  return SITE_PROFILE_REF_PATTERN.test(value);
}

function parseProfileReference(value) {
  const profileRef = String(value ?? '').trim();
  if (isLikelyGithubUsername(profileRef)) {
    return { type: 'github', value: profileRef };
  }
  if (isSiteProfileReference(profileRef)) {
    return { type: 'site', value: profileRef.slice('site:'.length) };
  }
  if (profileRef.startsWith('site:')) {
    return {
      type: 'invalid',
      value: profileRef,
      message: 'site profile reference must be site:<lowercase-source-person-id>',
    };
  }
  if (profileRef.includes(':')) {
    return {
      type: 'invalid',
      value: profileRef,
      message: 'unknown profile reference prefix',
    };
  }
  return {
    type: 'invalid-github',
    value: profileRef,
    message: 'value does not match GitHub username syntax',
  };
}

function normalizeGithubUsername(value) {
  return String(value).toLowerCase();
}

function siteProfileKey(eventId, sourcePersonId) {
  return `${eventId}\0${sourcePersonId}`;
}

function rowNumber(row) {
  return Number.isInteger(row._row) ? row._row : 0;
}

function addIssue(issues, level, sheet, row, field, message) {
  issues.push({ level, sheet, row, field, message });
}

export function formatIssue(issue) {
  const location = issue.row > 0
    ? `${issue.sheet}!row ${issue.row}${issue.field ? ` ${issue.field}` : ''}`
    : `${issue.sheet}${issue.field ? ` ${issue.field}` : ''}`;
  return `${issue.level.toUpperCase()} ${location}: ${issue.message}`;
}

export function countIssues(issues) {
  return {
    error: issues.filter((issue) => issue.level === 'error').length,
    warning: issues.filter((issue) => issue.level === 'warning').length,
  };
}

function printIssues(issues) {
  for (const issue of issues.filter((item) => item.level === 'error')) {
    console.error(formatIssue(issue));
  }
  for (const issue of issues.filter((item) => item.level === 'warning')) {
    console.warn(formatIssue(issue));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
