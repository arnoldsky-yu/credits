import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  assistantCommentLogins,
  isAssistantClaimComment,
  parseArgs,
  profileUsernameExists,
} from './create-claim-comment.mjs';

const claimBody = '<!-- sitcon-credits-profile-claim-confirmation -->\nbody';

test('parseArgs reads claim comment options', () => {
  assert.deepEqual(parseArgs([
    '--owner', 'sitcon-tw',
    '--repo', 'credits-profiles',
    '--pull-number', '58',
    '--head-sha', 'abc123',
    '--export', 'tmp/export.json',
    '--assistant-login', 'sitcon-credits',
  ]), {
    owner: 'sitcon-tw',
    repo: 'credits-profiles',
    pullNumber: 58,
    headSha: 'abc123',
    exportPath: 'tmp/export.json',
    assistantLogin: 'sitcon-credits',
  });
});

test('isAssistantClaimComment ignores user-authored marker comments', () => {
  assert.equal(isAssistantClaimComment({
    user: { login: 'denny0223' },
    body: claimBody,
  }), false);
});

test('isAssistantClaimComment accepts assistant login variants', () => {
  assert.equal(isAssistantClaimComment({
    user: { login: 'sitcon-credits[bot]' },
    body: claimBody,
  }), true);
  assert.equal(isAssistantClaimComment({
    user: { login: 'sitcon-credits-assistant[bot]' },
    body: claimBody,
  }, 'sitcon-credits-assistant'), true);
});

test('assistantCommentLogins includes app slug and bot suffix forms', () => {
  const logins = assistantCommentLogins('sitcon-credits');
  assert.equal(logins.has('sitcon-credits'), true);
  assert.equal(logins.has('sitcon-credits[bot]'), true);
  assert.equal(logins.has('app/sitcon-credits'), true);
});

test('profileUsernameExists detects canonical appearance username', () => {
  assert.equal(profileUsernameExists({
    sheets: {
      appearances: {
        rows: [
          { github_username: 'site:source' },
          { github_username: 'OctoCat' },
        ],
      },
    },
  }, 'octocat'), true);
  assert.equal(profileUsernameExists({
    sheets: {
      appearances: {
        rows: [
          { github_username: 'site:source' },
        ],
      },
    },
  }, 'octocat'), false);
});
