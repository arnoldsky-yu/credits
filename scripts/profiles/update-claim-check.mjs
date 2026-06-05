import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import { githubRequest } from '../lib/github-api.mjs';
import {
  formatApplyFailureOutput,
  formatApplySuccessOutput,
} from './claim-confirmation.mjs';

export async function main(argv = process.argv.slice(2), env = process.env) {
  const options = parseArgs(argv);
  const token = env.GITHUB_TOKEN;
  if (!token) {
    throw new Error('GITHUB_TOKEN is required.');
  }
  if (!options.checkRunId) {
    console.log('Profile claim check update skipped: no check run id.');
    return;
  }

  const output = options.conclusion === 'success'
    ? formatApplySuccessOutput(JSON.parse(await readFile(options.planPath, 'utf8')))
    : formatApplyFailureOutput(options.message || 'workflow failed after applying profile claims');

  await githubRequest(token, `PATCH /repos/${options.owner}/${options.repo}/check-runs/${options.checkRunId}`, {
    status: 'completed',
    conclusion: output.conclusion,
    output: {
      title: output.title,
      summary: output.summary,
      text: output.text,
    },
  });
  console.log(`Profile claim check updated: ${output.conclusion}.`);
}

export function parseArgs(argv) {
  const options = {};
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
    if (arg === '--check-run-id') {
      options.checkRunId = readNextArg(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--plan') {
      options.planPath = readNextArg(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--conclusion') {
      options.conclusion = readNextArg(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--message') {
      options.message = readNextArg(argv, index, arg);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  for (const key of ['owner', 'repo', 'checkRunId', 'conclusion']) {
    if (!options[key]) {
      throw new Error(`Missing required option: ${key}`);
    }
  }
  if (options.conclusion === 'success' && !options.planPath) {
    throw new Error('--plan is required for success updates.');
  }
  if (!['success', 'failure'].includes(options.conclusion)) {
    throw new Error('--conclusion must be success or failure.');
  }
  return options;
}

function readNextArg(argv, index, name) {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${name} requires a value.`);
  }
  return value;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
