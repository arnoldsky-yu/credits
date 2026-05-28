import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { getServiceAccountAccessToken } from '../lib/google-auth.mjs';
import { SHEETS_API, sheetsFetch } from '../lib/google-sheets-api.mjs';
import { DEFAULT_CONFIG_PATH, getColumnNames, quoteSheetName, readSheetsConfig } from '../lib/sheets-config.mjs';

const READONLY_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';
const DEFAULT_OUTPUT_DIR = 'tmp/sheets-export';

export async function main(argv = process.argv.slice(2), env = process.env) {
  const options = parseArgs(argv);
  const config = await readSheetsConfig(options.configPath);

  if (options.dryRun) {
    console.log(formatPlan(config, options.outputDir));
    return;
  }

  const accessToken = await getServiceAccountAccessToken(env.GOOGLE_APPLICATION_CREDENTIALS, READONLY_SCOPE);
  const payload = await fetchExportPayload(config, accessToken);
  await writeExportPayload(payload, options.outputDir);
  console.log(`Exported ${Object.keys(payload.sheets).length} sheets to ${options.outputDir}.`);
}

export function parseArgs(argv) {
  const options = {
    configPath: DEFAULT_CONFIG_PATH,
    dryRun: false,
    outputDir: DEFAULT_OUTPUT_DIR,
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
    if (arg === '--output-dir') {
      options.outputDir = readNextArg(argv, index, '--output-dir');
      index += 1;
      continue;
    }
    if (arg.startsWith('--output-dir=')) {
      options.outputDir = readInlineArg(arg, '--output-dir');
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

export function formatPlan(config, outputDir) {
  const lines = [
    `Spreadsheet: ${config.spreadsheetId}`,
    `Output directory: ${outputDir}`,
  ];
  for (const sheet of config.sheets) {
    lines.push(`- ${sheet.title}: ${getColumnNames(sheet).join(', ')}`);
  }
  return lines.join('\n');
}

export async function fetchExportPayload(config, accessToken, exportedAt = new Date().toISOString()) {
  const response = await sheetsFetch(buildBatchGetUrl(config), accessToken);
  return buildExportPayload(config, response.valueRanges ?? [], exportedAt);
}

export function buildBatchGetUrl(config) {
  const params = new URLSearchParams();
  for (const sheet of config.sheets) {
    params.append('ranges', encodeRange(sheet.title));
  }
  params.set('majorDimension', 'ROWS');
  return `${SHEETS_API}/${config.spreadsheetId}/values:batchGet?${params.toString()}`;
}

export function buildExportPayload(config, valueRanges, exportedAt) {
  const valuesBySheetTitle = new Map(
    valueRanges.map((valueRange) => [sheetTitleFromRange(valueRange.range), valueRange.values ?? []]),
  );
  const payload = {
    spreadsheetId: config.spreadsheetId,
    exportedAt,
    sheets: {},
  };

  for (const sheet of config.sheets) {
    const columns = getColumnNames(sheet);
    const values = valuesBySheetTitle.get(sheet.title) ?? [];
    payload.sheets[sheet.title] = {
      columns,
      rows: normalizeSheetRows(sheet.title, columns, values),
    };
  }

  return payload;
}

export function normalizeSheetRows(sheetTitle, expectedColumns, values) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error(`Sheet ${sheetTitle} did not return a header row.`);
  }

  const actualColumns = values[0].map((value) => String(value ?? '').trim());
  const duplicateColumns = findDuplicates(actualColumns.filter((column) => column !== ''));
  if (duplicateColumns.length > 0) {
    throw new Error(`Sheet ${sheetTitle} has duplicate header columns: ${duplicateColumns.join(', ')}`);
  }

  const missingColumns = expectedColumns.filter((column) => !actualColumns.includes(column));
  if (missingColumns.length > 0) {
    throw new Error(`Sheet ${sheetTitle} is missing expected header columns: ${missingColumns.join(', ')}`);
  }

  const columnIndexes = expectedColumns.map((column) => actualColumns.indexOf(column));
  return values
    .slice(1)
    .map((row, rowIndex) => {
      const record = {};
      for (const [index, column] of expectedColumns.entries()) {
        record[column] = String(row[columnIndexes[index]] ?? '').trim();
      }
      return { _row: rowIndex + 2, ...record };
    })
    .filter((record) => expectedColumns.some((column) => record[column] !== ''));
}

function findDuplicates(values) {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
    }
    seen.add(value);
  }
  return [...duplicates];
}

export async function writeExportPayload(payload, outputDir) {
  await mkdir(outputDir, { recursive: true });

  const summarySheets = {};
  for (const [title, sheet] of Object.entries(payload.sheets)) {
    const fileStem = sheetFileStem(title);
    const jsonFile = `${fileStem}.json`;
    const csvFile = `${fileStem}.csv`;

    await writeFile(
      path.join(outputDir, jsonFile),
      `${JSON.stringify({ exportedAt: payload.exportedAt, columns: sheet.columns, rows: sheet.rows }, null, 2)}\n`,
    );
    await writeFile(path.join(outputDir, csvFile), toCsv(sheet.columns, sheet.rows));

    summarySheets[title] = {
      rows: sheet.rows.length,
      columns: sheet.columns.length,
      jsonFile,
      csvFile,
    };
  }

  await writeFile(path.join(outputDir, 'export.json'), `${JSON.stringify(payload, null, 2)}\n`);
  await writeFile(
    path.join(outputDir, 'summary.json'),
    `${JSON.stringify({
      spreadsheetId: payload.spreadsheetId,
      exportedAt: payload.exportedAt,
      outputDir,
      sheets: summarySheets,
    }, null, 2)}\n`,
  );
}

function sheetFileStem(title) {
  return title.replace(/[^A-Za-z0-9_-]/g, '_');
}

export function toCsv(columns, rows) {
  const lines = [columns.map(csvValue).join(',')];
  for (const row of rows) {
    lines.push(columns.map((column) => csvValue(row[column])).join(','));
  }
  return `${lines.join('\n')}\n`;
}

function csvValue(value) {
  const text = String(value ?? '');
  if (/[",\n\r]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

function encodeRange(sheetTitle) {
  return `${quoteSheetName(sheetTitle)}!A1:ZZ`;
}

export function sheetTitleFromRange(range) {
  const title = String(range ?? '').split('!')[0] ?? '';
  if (title.startsWith("'") && title.endsWith("'")) {
    return title.slice(1, -1).replaceAll("''", "'");
  }
  return title;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
