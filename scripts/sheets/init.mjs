import { getServiceAccountAccessToken } from '../lib/google-auth.mjs';
import { SHEETS_API, sheetsFetch } from '../lib/google-sheets-api.mjs';
import {
  DEFAULT_CONFIG_PATH,
  columnNameFromConfig,
  columnNoteFromConfig,
  getColumnNames,
  quoteSheetName,
  readSheetsConfig,
  spreadsheetColumnName,
} from '../lib/sheets-config.mjs';

const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

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
  const config = await readSheetsConfig(configPath);

  if (dryRun) {
    printPlan(config);
    return;
  }

  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!credentialsPath) {
    throw new Error('GOOGLE_APPLICATION_CREDENTIALS must point to a local service account JSON file.');
  }

  const accessToken = await getServiceAccountAccessToken(credentialsPath, SCOPE);
  const spreadsheet = await sheetsFetch(
    `${SHEETS_API}/${config.spreadsheetId}?fields=sheets(properties(sheetId,title,gridProperties),conditionalFormats)`,
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
      `${SHEETS_API}/${config.spreadsheetId}?fields=sheets(properties(sheetId,title,gridProperties),conditionalFormats)`,
      accessToken,
    )
    : spreadsheet;
  const sheetsByTitle = new Map(
    (refreshedSpreadsheet.sheets ?? []).map((sheet) => [
      sheet.properties.title,
      {
        ...sheet.properties,
        conditionalFormats: sheet.conditionalFormats ?? [],
      },
    ]),
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
      console.log(`  validation ${validation.column}: ${validation.type} ${target} strict=${validation.strict ?? true}`);
    }
    for (const conditionalFormat of sheet.conditionalFormats ?? []) {
      console.log(
        `  conditional format ${conditionalFormat.column}: ${conditionalFormat.formula}`,
      );
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

    if (Array.isArray(sheet.conditionalFormats)) {
      for (const index of conditionalFormatRuleIndexes(properties).reverse()) {
        requests.push({
          deleteConditionalFormatRule: {
            sheetId,
            index,
          },
        });
      }

      for (const conditionalFormat of sheet.conditionalFormats) {
        const columnIndex = columnNames.indexOf(conditionalFormat.column);
        requests.push({
          addConditionalFormatRule: {
            rule: {
              ranges: [
                {
                  sheetId,
                  startRowIndex: 1,
                  endRowIndex: rowCount,
                  startColumnIndex: columnIndex,
                  endColumnIndex: columnIndex + 1,
                },
              ],
              booleanRule: {
                condition: {
                  type: 'CUSTOM_FORMULA',
                  values: [{ userEnteredValue: conditionalFormat.formula }],
                },
                format: {
                  backgroundColor: conditionalFormat.backgroundColor,
                },
              },
            },
            index: 0,
          },
        });
      }
    }
  }

  return requests;
}

function conditionalFormatRuleIndexes(sheetProperties) {
  const count = sheetProperties.conditionalFormats?.length ?? 0;
  return Array.from({ length: count }, (_, index) => index);
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
