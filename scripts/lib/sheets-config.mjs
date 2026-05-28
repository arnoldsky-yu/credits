import { readFile } from 'node:fs/promises';

export const DEFAULT_CONFIG_PATH = 'config/sheets.json';

const SUPPORTED_VALIDATION_TYPES = new Set(['ONE_OF_RANGE', 'ONE_OF_LIST']);
const INVALID_SHEET_TITLE_CHARS = /[\[\]*?/\\]/;

export async function readSheetsConfig(configPath = DEFAULT_CONFIG_PATH) {
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  validateSheetsConfig(config);
  return config;
}

export function validateSheetsConfig(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error('config must be a JSON object.');
  }
  if (!isNonEmptyString(config.spreadsheetId)) {
    throw new Error('config.spreadsheetId is required.');
  }
  if (!Array.isArray(config.sheets) || config.sheets.length === 0) {
    throw new Error('config.sheets must be a non-empty array.');
  }

  const seenTitles = new Set();

  for (const sheet of config.sheets) {
    validateSheetConfig(sheet, seenTitles);
  }
}

function validateSheetConfig(sheet, seenTitles) {
  if (!sheet || typeof sheet !== 'object' || Array.isArray(sheet)) {
    throw new Error('Every sheet must be an object.');
  }
  if (!isNonEmptyString(sheet.title)) {
    throw new Error('Every sheet must have a title.');
  }
  if (seenTitles.has(sheet.title)) {
    throw new Error(`Duplicate sheet title ${sheet.title}.`);
  }
  seenTitles.add(sheet.title);

  if (sheet.title.length > 100 || INVALID_SHEET_TITLE_CHARS.test(sheet.title)) {
    throw new Error(`Sheet ${sheet.title} has a title that Google Sheets does not allow.`);
  }
  if (!Array.isArray(sheet.columns) || sheet.columns.length === 0) {
    throw new Error(`Sheet ${sheet.title} must define columns.`);
  }

  const seenColumns = new Set();
  for (const column of sheet.columns) {
    const name = columnNameFromConfig(column);
    if (!isNonEmptyString(name)) {
      throw new Error(`Sheet ${sheet.title} has a column without a name.`);
    }
    if (seenColumns.has(name)) {
      throw new Error(`Sheet ${sheet.title} has duplicate column ${name}.`);
    }
    seenColumns.add(name);

    const note = columnNoteFromConfig(column);
    if (note !== '' && typeof note !== 'string') {
      throw new Error(`Sheet ${sheet.title} column ${name} has a non-string note.`);
    }
  }

  for (const validation of sheet.validations ?? []) {
    validateDataValidationConfig(sheet.title, seenColumns, validation);
  }
  for (const conditionalFormat of sheet.conditionalFormats ?? []) {
    validateConditionalFormatConfig(sheet.title, seenColumns, conditionalFormat);
  }
}

function validateDataValidationConfig(sheetTitle, seenColumns, validation) {
  if (!validation || typeof validation !== 'object' || Array.isArray(validation)) {
    throw new Error(`Sheet ${sheetTitle} has an invalid validation rule.`);
  }
  if (!seenColumns.has(validation.column)) {
    throw new Error(`Sheet ${sheetTitle} validation references unknown column ${validation.column}.`);
  }
  if (!SUPPORTED_VALIDATION_TYPES.has(validation.type)) {
    throw new Error(`Sheet ${sheetTitle} validation on ${validation.column} has unsupported type ${validation.type}.`);
  }
  if (validation.strict !== undefined && typeof validation.strict !== 'boolean') {
    throw new Error(`Sheet ${sheetTitle} validation on ${validation.column} has a non-boolean strict value.`);
  }
  if (validation.type === 'ONE_OF_RANGE' && !isNonEmptyString(validation.range)) {
    throw new Error(`Sheet ${sheetTitle} validation on ${validation.column} needs a range.`);
  }
  if (validation.type === 'ONE_OF_LIST') {
    const values = validation.values ?? [];
    if (!Array.isArray(values) || values.length === 0 || values.some((value) => !isNonEmptyString(value))) {
      throw new Error(`Sheet ${sheetTitle} validation on ${validation.column} needs non-empty values.`);
    }
  }
}

function validateConditionalFormatConfig(sheetTitle, seenColumns, conditionalFormat) {
  if (!conditionalFormat || typeof conditionalFormat !== 'object' || Array.isArray(conditionalFormat)) {
    throw new Error(`Sheet ${sheetTitle} has an invalid conditional format rule.`);
  }
  if (!seenColumns.has(conditionalFormat.column)) {
    throw new Error(`Sheet ${sheetTitle} conditional format references unknown column ${conditionalFormat.column}.`);
  }
  if (!isNonEmptyString(conditionalFormat.formula)) {
    throw new Error(`Sheet ${sheetTitle} conditional format on ${conditionalFormat.column} needs a formula.`);
  }
  validateColor(conditionalFormat.backgroundColor, `Sheet ${sheetTitle} conditional format backgroundColor`);
}

function validateColor(color, label) {
  if (!color || typeof color !== 'object' || Array.isArray(color)) {
    throw new Error(`${label} is required.`);
  }
  for (const key of ['red', 'green', 'blue']) {
    if (typeof color[key] !== 'number' || color[key] < 0 || color[key] > 1) {
      throw new Error(`${label}.${key} must be a number between 0 and 1.`);
    }
  }
}

export function getColumnNames(sheet) {
  return sheet.columns.map((column) => columnNameFromConfig(column));
}

export function columnNameFromConfig(column) {
  return typeof column === 'string' ? column : column?.name;
}

export function columnNoteFromConfig(column) {
  return typeof column === 'string' ? '' : (column.note ?? '');
}

export function quoteSheetName(name) {
  return `'${name.replaceAll("'", "''")}'`;
}

export function spreadsheetColumnName(count) {
  let n = count;
  let name = '';
  while (n > 0) {
    n -= 1;
    name = String.fromCharCode(65 + (n % 26)) + name;
    n = Math.floor(n / 26);
  }
  return name;
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}
