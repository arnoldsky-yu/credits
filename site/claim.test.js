import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  ISSUE_FORM_HINTS_FIELD,
  claimSearch,
  claimShareUrl,
  claimTokensFromSearch,
  isClaimMode,
  isClaimUrlTooLong,
  profileRequestIssueUrl,
} from './claim.js';

test('claimSearch enables claim mode and round trips tokens', () => {
  const search = claimSearch(['EVENT-B/site:source-1', 'Alice'], '?q=alice');

  assert.equal(search, '?q=alice&claim=1&claims=Alice%2CEVENT-B%2Fsite%3Asource-1');
  assert.equal(isClaimMode(search), true);
  assert.deepEqual(claimTokensFromSearch(search), ['Alice', 'EVENT-B/site:source-1']);
});

test('claimShareUrl writes claim tokens into the query and preserves hash deep links', () => {
  const url = claimShareUrl({
    pathname: '/credits/',
    search: '?q=alice',
    hash: '#person=Alice',
  }, ['Alice']);

  assert.equal(url, '/credits/?q=alice&claim=1&claims=Alice#person=Alice');
});

test('profileRequestIssueUrl pre-fills the historical hints field with a claim URL', () => {
  const claimUrl = 'https://example.test/credits/?claim=1&claims=Alice';
  const url = new URL(profileRequestIssueUrl(claimUrl));

  assert.equal(url.searchParams.get('template'), 'profile-request.yml');
  assert.equal(url.searchParams.get(ISSUE_FORM_HINTS_FIELD), claimUrl);
  assert.equal(isClaimUrlTooLong(claimUrl), false);
});
