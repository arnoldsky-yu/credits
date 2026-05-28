import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';

export async function getServiceAccountAccessToken(credentialsPath, scope) {
  if (!credentialsPath) {
    throw new Error('GOOGLE_APPLICATION_CREDENTIALS must point to a local service account JSON file.');
  }
  if (!scope) {
    throw new Error('A Google OAuth scope is required.');
  }

  const credentials = JSON.parse(await readFile(credentialsPath, 'utf8'));
  if (!credentials.client_email || !credentials.private_key) {
    throw new Error('Service account credentials must include client_email and private_key.');
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: credentials.client_email,
    scope,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  };

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
  if (!token.access_token) {
    throw new Error('OAuth token response did not include access_token.');
  }
  return token.access_token;
}

function base64urlJson(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}
