import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseArgs } from './update-claim-check.mjs';

test('parseArgs reads success check update options', () => {
  assert.deepEqual(parseArgs([
    '--owner', 'sitcon-tw',
    '--repo', 'credits-profiles',
    '--check-run-id', '123',
    '--plan', 'tmp/plan.json',
    '--conclusion', 'success',
  ]), {
    owner: 'sitcon-tw',
    repo: 'credits-profiles',
    checkRunId: '123',
    planPath: 'tmp/plan.json',
    conclusion: 'success',
  });
});

test('parseArgs reads failure check update options', () => {
  assert.deepEqual(parseArgs([
    '--owner', 'sitcon-tw',
    '--repo', 'credits-profiles',
    '--check-run-id', '123',
    '--conclusion', 'failure',
    '--message', 'failed',
  ]), {
    owner: 'sitcon-tw',
    repo: 'credits-profiles',
    checkRunId: '123',
    conclusion: 'failure',
    message: 'failed',
  });
});

test('parseArgs requires plan for success updates', () => {
  assert.throws(() => parseArgs([
    '--owner', 'sitcon-tw',
    '--repo', 'credits-profiles',
    '--check-run-id', '123',
    '--conclusion', 'success',
  ]), /--plan is required/);
});
