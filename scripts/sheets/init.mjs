import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

const DEFAULT_CONFIG_PATH = 'config/sheets.json';
const HEADER_BACKGROUND = { red: 0.09, green: 0.19, blue: 0.33 };
const HEADER_FOREGROUND = { red: 1, green: 1, blue: 1 };

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const configPath = getArgValue('--config') ?? DEFAULT_CONFIG_PATH;

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

async function main() {
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  validateConfig(config);

  if (dryRun) {
    printPlan(config);
    return;
  }

  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!credentialsPath) {
    throw new Error('GOOGLE_APPLICATION_CREDENTIALS must point to a local service account JSON file.');
  }

  const accessToken = await getAccessToken(credentialsPath);
  const spreadsheet = await sheetsFetch(
    `${SHEETS_API}/${config.spreadsheetId}?fields=sheets(properties(sheetId,title,gridProperties))`,
    accessToken,
  );

  const existingSheets = new Map(
    (spreadsheet.sheets ?? []).map((sheet) => [sheet.properties.title, sheet.properties]),
  );

  const addRequests = buildAddSheetRequests(config, existingSheets);
  if (addRequests.length > 0) {
    await batchUpdate(config.spreadsheetId, addRequests, accessToken);
  }

  const refreshedSpreadsheet = addRequests.length > 0
    ? await sheetsFetch(
      `${SHEETS_API}/${config.spreadsheetId}?fields=sheets(properties(sheetId,title,gridProperties))`,
      accessToken,
    )
    : spreadsheet;
  const sheetsByTitle = new Map(
    (refreshedSpreadsheet.sheets ?? []).map((sheet) => [sheet.properties.title, sheet.properties]),
  );

  const formatRequests = buildFormatRequests(config, sheetsByTitle);
  if (formatRequests.length > 0) {
    await batchUpdate(config.spreadsheetId, formatRequests, accessToken);
  }

  await updateHeaders(config, accessToken);
  console.log(`Initialized Google Sheet ${config.spreadsheetId}.`);
}

function getArgValue(name) {
  const prefix = `${name}=`;
  const value = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return value?.slice(prefix.length);
}

function validateConfig(config) {
  if (!config.spreadsheetId) {
    throw new Error('config.spreadsheetId is required.');
  }
  if (!Array.isArray(config.sheets) || config.sheets.length === 0) {
    throw new Error('config.sheets must be a non-empty array.');
  }

  for (const sheet of config.sheets) {
    if (!sheet.title) {
      throw new Error('Every sheet must have a title.');
    }
    if (!Array.isArray(sheet.columns) || sheet.columns.length === 0) {
      throw new Error(`Sheet ${sheet.title} must define columns.`);
    }
    const seenColumns = new Set();
    for (const column of sheet.columns) {
      const name = columnNameFromConfig(column);
      if (!name) {
        throw new Error(`Sheet ${sheet.title} has a column without a name.`);
      }
      if (seenColumns.has(name)) {
        throw new Error(`Sheet ${sheet.title} has duplicate column ${name}.`);
      }
      seenColumns.add(name);
    }
    for (const validation of sheet.validations ?? []) {
      if (!seenColumns.has(validation.column)) {
        throw new Error(`Sheet ${sheet.title} validation references unknown column ${validation.column}.`);
      }
    }
  }
}

function printPlan(config) {
  console.log(`Spreadsheet: ${config.spreadsheetId}`);
  for (const sheet of config.sheets) {
    const columnNames = getColumnNames(sheet);
    console.log(`- ${sheet.title}: ${columnNames.join(', ')}`);
    for (const column of sheet.columns) {
      const name = columnNameFromConfig(column);
      const note = columnNoteFromConfig(column);
      if (note) {
        console.log(`  note ${name}: ${note}`);
      }
    }
    for (const validation of sheet.validations ?? []) {
      const target = validation.type === 'ONE_OF_RANGE'
        ? validation.range
        : (validation.values ?? []).join(', ');
      console.log(`  validation ${validation.column}: ${validation.type} ${target}`);
    }
  }
}

function buildAddSheetRequests(config, existingSheets) {
  return config.sheets
    .filter((sheet) => !existingSheets.has(sheet.title))
    .map((sheet, index) => ({
      addSheet: {
        properties: {
          title: sheet.title,
          index,
          gridProperties: {
            rowCount: sheet.rowCount ?? 1000,
            columnCount: getColumnNames(sheet).length,
            frozenRowCount: 1,
          },
        },
      },
    }));
}

function buildFormatRequests(config, sheetsByTitle) {
  const requests = [];

  for (const sheet of config.sheets) {
    const properties = sheetsByTitle.get(sheet.title);
    if (!properties) {
      throw new Error(`Sheet ${sheet.title} was not found after creation.`);
    }

    const sheetId = properties.sheetId;
    const columnNames = getColumnNames(sheet);
    const rowCount = Math.max(sheet.rowCount ?? 1000, properties.gridProperties?.rowCount ?? 0);
    const columnCount = Math.max(columnNames.length, properties.gridProperties?.columnCount ?? 0);

    requests.push({
      updateSheetProperties: {
        properties: {
          sheetId,
          gridProperties: {
            rowCount,
            columnCount,
            frozenRowCount: 1,
          },
        },
        fields: 'gridProperties(rowCount,columnCount,frozenRowCount)',
      },
    });

    requests.push({
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: 0,
          endRowIndex: 1,
          startColumnIndex: 0,
          endColumnIndex: columnNames.length,
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: HEADER_BACKGROUND,
            horizontalAlignment: 'CENTER',
            textFormat: {
              bold: true,
              foregroundColor: HEADER_FOREGROUND,
            },
            wrapStrategy: 'WRAP',
          },
        },
        fields: 'userEnteredFormat(backgroundColor,horizontalAlignment,textFormat,wrapStrategy)',
      },
    });

    requests.push({
      updateDimensionProperties: {
        range: {
          sheetId,
          dimension: 'COLUMNS',
          startIndex: 0,
          endIndex: columnNames.length,
        },
        properties: {
          pixelSize: 180,
        },
        fields: 'pixelSize',
      },
    });

    for (const [index, column] of sheet.columns.entries()) {
      const note = columnNoteFromConfig(column);
      if (!note) {
        continue;
      }
      requests.push({
        repeatCell: {
          range: {
            sheetId,
            startRowIndex: 0,
            endRowIndex: 1,
            startColumnIndex: index,
            endColumnIndex: index + 1,
          },
          cell: {
            note,
          },
          fields: 'note',
        },
      });
    }

    for (const validation of sheet.validations ?? []) {
      const columnIndex = columnNames.indexOf(validation.column);
      requests.push({
        setDataValidation: {
          range: {
            sheetId,
            startRowIndex: 1,
            endRowIndex: rowCount,
            startColumnIndex: columnIndex,
            endColumnIndex: columnIndex + 1,
          },
          rule: buildValidationRule(validation),
        },
      });
    }
  }

  return requests;
}

function buildValidationRule(validation) {
  if (validation.type === 'ONE_OF_RANGE') {
    return {
      condition: {
        type: 'ONE_OF_RANGE',
        values: [{ userEnteredValue: `=${validation.range}` }],
      },
      strict: validation.strict ?? true,
      showCustomUi: true,
    };
  }

  if (validation.type === 'ONE_OF_LIST') {
    return {
      condition: {
        type: 'ONE_OF_LIST',
        values: (validation.values ?? []).map((value) => ({ userEnteredValue: value })),
      },
      strict: validation.strict ?? true,
      showCustomUi: true,
    };
  }

  throw new Error(`Unsupported validation type ${validation.type}.`);
}

async function updateHeaders(config, accessToken) {
  const data = config.sheets.map((sheet) => ({
    range: `${quoteSheetName(sheet.title)}!A1:${spreadsheetColumnName(getColumnNames(sheet).length)}1`,
    majorDimension: 'ROWS',
    values: [getColumnNames(sheet)],
  }));

  await sheetsFetch(`${SHEETS_API}/${config.spreadsheetId}/values:batchUpdate`, accessToken, {
    method: 'POST',
    body: JSON.stringify({
      valueInputOption: 'RAW',
      data,
    }),
  });
}

async function batchUpdate(spreadsheetId, requests, accessToken) {
  await sheetsFetch(`${SHEETS_API}/${spreadsheetId}:batchUpdate`, accessToken, {
    method: 'POST',
    body: JSON.stringify({ requests }),
  });
}

async function sheetsFetch(url, accessToken, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Sheets API request failed ${response.status}: ${body}`);
  }

  return response.json();
}

async function getAccessToken(credentialsPath) {
  const credentials = JSON.parse(await readFile(credentialsPath, 'utf8'));
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: credentials.client_email,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  };

  if (!credentials.client_email || !credentials.private_key) {
    throw new Error('Service account credentials must include client_email and private_key.');
  }

  const unsigned = `${base64urlJson(header)}.${base64urlJson(claim)}`;
  const signature = crypto
    .createSign('RSA-SHA256')
    .update(unsigned)
    .sign(credentials.private_key)
    .toString('base64url');

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${signature}`,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OAuth token request failed ${response.status}: ${body}`);
  }

  const token = await response.json();
  return token.access_token;
}

function base64urlJson(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function quoteSheetName(name) {
  return `'${name.replaceAll("'", "''")}'`;
}

function getColumnNames(sheet) {
  return sheet.columns.map((column) => columnNameFromConfig(column));
}

function columnNameFromConfig(column) {
  return typeof column === 'string' ? column : column.name;
}

function columnNoteFromConfig(column) {
  return typeof column === 'string' ? '' : (column.note ?? '');
}

function spreadsheetColumnName(count) {
  let n = count;
  let name = '';
  while (n > 0) {
    n -= 1;
    name = String.fromCharCode(65 + (n % 26)) + name;
    n = Math.floor(n / 26);
  }
  return name;
}
