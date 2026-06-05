import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import { githubPaginate, githubRequest } from '../lib/github-api.mjs';
import {
  CLAIM_CHECK_MARKER,
  buildProfileClaimPlan,
  formatClaimCommentBody,
} from './claim-confirmation.mjs';
import { extractLinkedIssueNumber } from './create-claim-check.mjs';

const DEFAULT_ASSISTANT_LOGIN = 'sitcon-credits';

export async function main(argv = process.argv.slice(2), env = process.env) {
  const options = parseArgs(argv);
  const token = env.GITHUB_TOKEN;
  if (!token) {
    throw new Error('GITHUB_TOKEN is required.');
  }

  const pullRequest = await githubRequest(token, `GET /repos/${options.owner}/${options.repo}/pulls/${options.pullNumber}`);
  if (pullRequest.state !== 'open') {
    console.log(`Profile claim confirmation skipped: PR #${options.pullNumber} is ${pullRequest.state}.`);
    return;
  }
  if (pullRequest.head?.sha !== options.headSha) {
    console.log('Profile claim confirmation skipped: stale-pr-head.');
    return;
  }

  const [files, sourceIssue, exportPayload] = await Promise.all([
    githubPaginate(token, `GET /repos/${options.owner}/${options.repo}/pulls/${options.pullNumber}/files?per_page=100`),
    fetchLinkedIssue(token, options, pullRequest),
    readJson(options.exportPath),
  ]);
  const plan = buildProfileClaimPlan({ pullRequest, files, sourceIssue, exportPayload });
  if (plan.status === 'not_applicable') {
    console.log(`Profile claim confirmation skipped: ${plan.reason}.`);
    return;
  }
  if (profileUsernameExists(exportPayload, plan.username)) {
    const deleted = await deleteClaimComments(token, options);
    console.log(`Profile claim confirmation skipped: username-present-in-appearances; deleted ${deleted} stale comment(s).`);
    return;
  }

  const body = formatClaimCommentBody(plan, {
    pullNumber: options.pullNumber,
    headSha: options.headSha,
  });
  const comment = await upsertClaimComment(token, options, body);
  console.log(`Profile claim confirmation comment ${comment.id}: ${plan.reason}.`);
}

export function parseArgs(argv) {
  const options = {
    assistantLogin: DEFAULT_ASSISTANT_LOGIN,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--owner') {
      options.owner = readNextArg(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--repo') {
      options.repo = readNextArg(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--pull-number') {
      options.pullNumber = Number(readNextArg(argv, index, arg));
      index += 1;
      continue;
    }
    if (arg === '--head-sha') {
      options.headSha = readNextArg(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--export') {
      options.exportPath = readNextArg(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--assistant-login') {
      options.assistantLogin = readNextArg(argv, index, arg);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  for (const key of ['owner', 'repo', 'pullNumber', 'headSha', 'exportPath']) {
    if (!options[key]) {
      throw new Error(`Missing required option: ${key}`);
    }
  }
  return options;
}

export async function upsertClaimComment(token, options, body) {
  const comments = await githubPaginate(token, `GET /repos/${options.owner}/${options.repo}/issues/${options.pullNumber}/comments?per_page=100`);
  const existing = comments.find((comment) => isAssistantClaimComment(comment, options.assistantLogin));
  if (existing) {
    return githubRequest(token, `PATCH /repos/${options.owner}/${options.repo}/issues/comments/${existing.id}`, { body });
  }
  return githubRequest(token, `POST /repos/${options.owner}/${options.repo}/issues/${options.pullNumber}/comments`, { body });
}

export async function deleteClaimComments(token, options) {
  const comments = await githubPaginate(token, `GET /repos/${options.owner}/${options.repo}/issues/${options.pullNumber}/comments?per_page=100`);
  const matching = comments.filter((comment) => isAssistantClaimComment(comment, options.assistantLogin));
  for (const comment of matching) {
    await githubRequest(token, `DELETE /repos/${options.owner}/${options.repo}/issues/comments/${comment.id}`);
  }
  return matching.length;
}

export function profileUsernameExists(exportPayload, username) {
  const normalized = String(username ?? '').trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  const rows = exportPayload?.sheets?.appearances?.rows;
  if (!Array.isArray(rows)) {
    return false;
  }
  return rows.some((row) => String(row.github_username ?? '').trim().toLowerCase() === normalized);
}

export function isAssistantClaimComment(comment, assistantLogin = DEFAULT_ASSISTANT_LOGIN) {
  return comment.body?.includes(CLAIM_CHECK_MARKER) &&
    assistantCommentLogins(assistantLogin).has(comment.user?.login);
}

export function assistantCommentLogins(assistantLogin = DEFAULT_ASSISTANT_LOGIN) {
  const logins = new Set([
    DEFAULT_ASSISTANT_LOGIN,
    `${DEFAULT_ASSISTANT_LOGIN}[bot]`,
    'sitcon-credits-assistant[bot]',
  ]);
  const bareLogin = String(assistantLogin ?? '').replace(/\[bot\]$/, '');
  for (const login of [assistantLogin, bareLogin]) {
    if (!login) {
      continue;
    }
    logins.add(login);
    logins.add(`${login}[bot]`);
    logins.add(`app/${login}`);
  }
  return logins;
}

async function fetchLinkedIssue(token, options, pullRequest) {
  const issueNumber = extractLinkedIssueNumber(pullRequest.body ?? '');
  if (!issueNumber) {
    return null;
  }
  return githubRequest(token, `GET /repos/${options.owner}/${options.repo}/issues/${issueNumber}`);
}

function readNextArg(argv, index, name) {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${name} requires a value.`);
  }
  return value;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
