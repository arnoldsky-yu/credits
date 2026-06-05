import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import { getServiceAccountAccessToken } from '../lib/google-auth.mjs';
import { githubPaginate, githubRequest } from '../lib/github-api.mjs';
import { SHEETS_API, sheetsFetch } from '../lib/google-sheets-api.mjs';
import { DEFAULT_CONFIG_PATH, readSheetsConfig } from '../lib/sheets-config.mjs';
import {
  buildProfileClaimPlan,
  buildSheetValueUpdates,
  formatApplyFailureOutput,
} from './claim-confirmation.mjs';
import { extractLinkedIssueNumber } from './create-claim-check.mjs';

const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

export async function main(argv = process.argv.slice(2), env = process.env) {
  const options = parseArgs(argv);
  const token = env.GITHUB_TOKEN;
  if (!token) {
    throw new Error('GITHUB_TOKEN is required.');
  }

  try {
    const result = await applyProfileClaims(options, env, token);
    console.log(formatApplyPlan(result.plan));
  } catch (error) {
    if (options.checkRunId) {
      await updateCheckRun(token, options, formatApplyFailureOutput(error instanceof Error ? error.message : String(error)));
    }
    throw error;
  }
}

export async function applyProfileClaims(options, env, token) {
  const [config, pullRequest] = await Promise.all([
    readSheetsConfig(options.configPath),
    githubRequest(token, `GET /repos/${options.owner}/${options.repo}/pulls/${options.pullNumber}`),
  ]);
  if (pullRequest.state !== 'open') {
    throw new Error(`PR #${options.pullNumber} is ${pullRequest.state}; only open PRs can apply profile claims.`);
  }
  if (pullRequest.head?.sha !== options.headSha) {
    throw new Error('PR head SHA changed; rerun profile review before applying claims.');
  }

  const [files, sourceIssue, exportPayload] = await Promise.all([
    githubPaginate(token, `GET /repos/${options.owner}/${options.repo}/pulls/${options.pullNumber}/files?per_page=100`),
    fetchLinkedIssue(token, options, pullRequest),
    readJson(options.exportPath),
  ]);
  const plan = buildProfileClaimPlan({ pullRequest, files, sourceIssue, exportPayload });
  if (plan.status !== 'ready') {
    throw new Error(`profile claim plan is not ready: ${plan.reason}`);
  }

  if (!options.apply) {
    return { plan, applied: false };
  }

  if (options.planOutputPath) {
    await writeFile(options.planOutputPath, `${JSON.stringify(plan, null, 2)}\n`);
  }

  const credentialsPath = env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!credentialsPath) {
    throw new Error('GOOGLE_APPLICATION_CREDENTIALS must point to a local service account JSON file.');
  }
  const accessToken = await getServiceAccountAccessToken(credentialsPath, SCOPE);
  await applySheetValueUpdates(config, buildSheetValueUpdates(config, plan), accessToken);

  return { plan, applied: true };
}

export function parseArgs(argv) {
  const options = {
    configPath: DEFAULT_CONFIG_PATH,
    apply: false,
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
    if (arg === '--check-run-id') {
      options.checkRunId = readNextArg(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--plan-output') {
      options.planOutputPath = readNextArg(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--config') {
      options.configPath = readNextArg(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--apply') {
      options.apply = true;
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

export async function applySheetValueUpdates(config, data, accessToken) {
  if (data.length === 0) {
    throw new Error('no sheet updates to apply.');
  }
  return sheetsFetch(`${SHEETS_API}/${config.spreadsheetId}/values:batchUpdate`, accessToken, {
    method: 'POST',
    body: JSON.stringify({
      valueInputOption: 'RAW',
      data,
    }),
  });
}

export function formatApplyPlan(plan) {
  return [
    `Profile username: ${plan.username}`,
    `Updates: ${plan.updates.length}`,
    ...plan.updates.map((update) => [
      `- appearances row ${update.rowNumber}`,
      update.eventId,
      update.displayNameAtEvent,
      `${update.currentValue} -> ${update.nextValue}`,
    ].join(' | ')),
  ].join('\n');
}

async function updateCheckRun(token, options, output) {
  await githubRequest(token, `PATCH /repos/${options.owner}/${options.repo}/check-runs/${options.checkRunId}`, {
    status: 'completed',
    conclusion: output.conclusion,
    output: {
      title: output.title,
      summary: output.summary,
      text: output.text,
    },
  });
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
