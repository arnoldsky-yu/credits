import assert from 'node:assert/strict';
import { test } from 'node:test';

import { validateSheetsConfig } from './sheets-config.mjs';

test('validateSheetsConfig accepts custom formula validations', () => {
  assert.doesNotThrow(() => validateSheetsConfig({
    spreadsheetId: 'spreadsheet-id',
    sheets: [
      {
        title: 'people',
        columns: [{ name: 'github_username' }],
        validations: [
          {
            column: 'github_username',
            type: 'CUSTOM_FORMULA',
            formula: '=OR($A2="",COUNTIF($A$2:$A,$A2)=1)',
            strict: true,
          },
        ],
      },
    ],
  }));
});

test('validateSheetsConfig requires custom formula validations to include a formula', () => {
  assert.throws(() => validateSheetsConfig({
    spreadsheetId: 'spreadsheet-id',
    sheets: [
      {
        title: 'people',
        columns: [{ name: 'github_username' }],
        validations: [
          {
            column: 'github_username',
            type: 'CUSTOM_FORMULA',
          },
        ],
      },
    ],
  }), /needs a formula/);
});
