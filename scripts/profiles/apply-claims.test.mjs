import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  formatApplyPlan,
  parseArgs,
} from './apply-claims.mjs';

test('parseArgs reads apply claim options', () => {
  assert.deepEqual(parseArgs([
    '--owner', 'sitcon-tw',
    '--repo', 'credits-profiles',
    '--pull-number', '58',
    '--head-sha', 'abc123',
    '--export', 'tmp/export.json',
    '--check-run-id', '12345',
    '--plan-output', 'tmp/plan.json',
    '--config', 'custom.json',
    '--apply',
  ]), {
    owner: 'sitcon-tw',
    repo: 'credits-profiles',
    pullNumber: 58,
    headSha: 'abc123',
    exportPath: 'tmp/export.json',
    checkRunId: '12345',
    planOutputPath: 'tmp/plan.json',
    configPath: 'custom.json',
    apply: true,
  });
});

test('formatApplyPlan summarizes row updates', () => {
  assert.equal(formatApplyPlan({
    username: 'octocat',
    updates: [
      {
        rowNumber: 7,
        eventId: 'SITCON-2024',
        displayNameAtEvent: 'Octo',
        currentValue: 'site:source-1',
        nextValue: 'octocat',
      },
    ],
  }), [
    'Profile username: octocat',
    'Updates: 1',
    '- appearances row 7 | SITCON-2024 | Octo | site:source-1 -> octocat',
  ].join('\n'));
});
