import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import { DEFAULT_CONFIG_PATH, getColumnNames, readSheetsConfig } from '../lib/sheets-config.mjs';

const DEFAULT_EXPORT_PATH = 'tmp/sheets-export/export.json';
const GITHUB_USERNAME_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
const CLASSIFICATION_LABELS = new Set(['staff', 'speaker', '工作人員', '講者']);

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const [config, payload] = await Promise.all([
    readSheetsConfig(options.configPath),
    readJson(options.exportPath),
  ]);
  const issues = validateExportPayload(payload, config);
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

export function validateExportPayload(payload, config) {
  const issues = [];
  validatePayloadEnvelope(issues, payload, config);

  const appearances = getRows(payload, config, 'appearances', issues);
  const events = getRows(payload, config, 'events', issues);
  const people = getRows(payload, config, 'people', issues);

  const eventsById = validateEvents(issues, events);
  const peopleByUsername = validatePeople(issues, people);
  validateAppearances(issues, appearances, eventsById, peopleByUsername);
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

function validateAppearances(issues, appearances, eventsById, peopleByUsername) {
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
      if (!isLikelyGithubUsername(appearance.github_username)) {
        addIssue(
          issues,
          'warning',
          'appearances',
          rowNumber(appearance),
          'github_username',
          'value does not match GitHub username syntax',
        );
      } else if (!peopleByUsername.has(normalizeGithubUsername(appearance.github_username))) {
        addIssue(
          issues,
          'warning',
          'appearances',
          rowNumber(appearance),
          'github_username',
          `profile username "${appearance.github_username}" is not present in people yet`,
        );
      }
    }

    warnRoleClassificationLabel(issues, appearance, 'role_group_zh');
    warnRoleClassificationLabel(issues, appearance, 'role_group_en');
    warnPrivateContact(issues, 'appearances', appearance, 'display_name_at_event');
    warnPrivateContact(issues, 'appearances', appearance, 'notes');
  }
}

function validateUnusedPeople(issues, people, appearances) {
  const usedGithubUsernames = new Set(
    appearances
      .map((appearance) => appearance.github_username)
      .filter(Boolean)
      .map((username) => normalizeGithubUsername(username)),
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

function normalizeGithubUsername(value) {
  return String(value).toLowerCase();
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
