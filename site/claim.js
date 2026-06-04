export const PROFILE_REQUEST_FORM_URL = 'https://github.com/sitcon-tw/credits-profiles/issues/new';
export const ISSUE_FORM_TEMPLATE = 'profile-request.yml';
export const ISSUE_FORM_HINTS_FIELD = 'historical_hints';
export const CLAIM_MODE_PARAM = 'claim';
export const CLAIMS_PARAM = 'claims';
export const MAX_CLAIM_URL_LENGTH = 7000;

export function isClaimMode(search) {
  return searchParams(search).get(CLAIM_MODE_PARAM) === '1';
}

export function claimTokensFromSearch(search) {
  const params = searchParams(search);
  return parseClaimTokens(params.get(CLAIMS_PARAM) || '');
}

export function claimSearch(tokens, currentSearch = '') {
  const params = searchParams(currentSearch);
  const normalized = normalizeTokens(tokens);
  params.set(CLAIM_MODE_PARAM, '1');
  if (normalized.length > 0) {
    params.set(CLAIMS_PARAM, normalized.join(','));
  } else {
    params.delete(CLAIMS_PARAM);
  }
  const text = params.toString();
  return text ? `?${text}` : '';
}

export function claimShareUrl(locationLike, tokens) {
  const base = locationLike.pathname || '/';
  const hash = locationLike.hash || '';
  return `${base}${claimSearch(tokens, locationLike.search || '')}${hash}`;
}

export function profileRequestIssueUrl(claimUrl, baseUrl = PROFILE_REQUEST_FORM_URL) {
  const url = new URL(baseUrl);
  url.searchParams.set('template', ISSUE_FORM_TEMPLATE);
  url.searchParams.set(ISSUE_FORM_HINTS_FIELD, claimUrl);
  return url.toString();
}

export function isClaimUrlTooLong(claimUrl) {
  return claimUrl.length > MAX_CLAIM_URL_LENGTH;
}

function parseClaimTokens(value) {
  return normalizeTokens(String(value || '').split(','));
}

function normalizeTokens(tokens) {
  return [...new Set(Array.from(tokens, (token) => String(token || '').trim()).filter(Boolean))].sort();
}

function searchParams(search) {
  const text = String(search || '').replace(/^\?/, '');
  return new URLSearchParams(text);
}
