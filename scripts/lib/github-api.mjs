export async function githubRequest(token, route, body = null) {
  const [method, path] = route.split(' ');
  const response = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: body === null ? undefined : JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    const error = new Error(`GitHub API request failed ${response.status}: ${text}`);
    error.status = response.status;
    error.body = text;
    throw error;
  }

  if (response.status === 204) {
    return null;
  }
  return response.json();
}

export async function githubPaginate(token, route) {
  const results = [];
  let nextRoute = route;

  while (nextRoute) {
    const [method, path] = nextRoute.split(' ');
    const response = await fetch(`https://api.github.com${path}`, {
      method,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`GitHub API request failed ${response.status}: ${text}`);
    }

    const page = await response.json();
    if (!Array.isArray(page)) {
      throw new Error('GitHub paginated response must be an array.');
    }
    results.push(...page);

    const link = response.headers.get('link') ?? '';
    const next = parseNextLink(link);
    nextRoute = next ? `${method} ${next.pathname}${next.search}` : '';
  }

  return results;
}

function parseNextLink(linkHeader) {
  for (const part of linkHeader.split(',')) {
    const match = part.match(/<([^>]+)>;\s*rel="next"/);
    if (match) {
      return new URL(match[1]);
    }
  }
  return null;
}
