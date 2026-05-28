export const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';

export async function sheetsFetch(url, accessToken, options = {}) {
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
