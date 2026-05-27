# AGENTS.md

This repository maintains SITCON Credits, a long-term public index of SITCON staff and speaker contribution records.

The public reader-facing documentation should be written in Traditional Chinese for Taiwan unless a file explicitly targets another audience. This file is written in English because it is intended for LLM agents and automated maintainers.

## Project Purpose

- Preserve public contribution records for SITCON-related events.
- Help contributors, organizers, and community members find historical staff and speaker records without searching every event website manually.
- Allow contributors to opt in to public profile information such as a preferred display name, biography, avatar, and links.
- Keep data maintenance practical for current SITCON staff who already work in the Google Workspace ecosystem.

## Data Authority

- Official historical event websites are the evidence source for event contribution records.
- Google Sheets is the operational canonical dataset after records are collected, reviewed, and accepted by maintainers.
- GitHub Pages is the intended public output.
- GitHub Actions is the intended export/build path from the controlled dataset to the static site.

Do not describe planned infrastructure as already implemented. If a Sheet, Form, Action, schema, or deployment does not exist yet, document it as planned or `TBD`.

Repository tools may use maintainer-provided service account credentials to operate the controlled Google Sheet, including initializing sheets, syncing validation helper sheets, configuring validation, exporting data, or running checks. Do not describe GitHub Actions automation, secrets, credentials, or related workflows as active until they exist in the repository and Google Workspace configuration.

Service account credentials and other secrets may exist locally for maintainers, but they must not be committed or read by LLM agents. In particular, do not open, inspect, parse, copy, summarize, or print files such as `credentials.json`, `*credentials*.json`, `*service-account*.json`, `.env`, or `.env.*`. If a task requires confirming secret presence, use file metadata, `.gitignore`, or `git status` only; do not read the secret contents.

If official event websites and the reviewed canonical Sheet disagree, public output should follow the maintainer-reviewed canonical Sheet. Do not resolve conflicts yourself unless the repository documentation or a maintainer explicitly gives the rule for that case.

Low-risk self-service profile updates may be planned as a GitHub PR workflow, but do not describe that automation as active until the repository has the corresponding schema, validation workflow, branch protection or ruleset, and merge permissions configured.

## Scope

The initial scope includes staff and speakers for SITCON-related events, including but not limited to:

- SITCON annual conferences
- SITCON Camp
- Hour of Code
- Hackathons
- Other SITCON-run, co-run, formally branded, or long-term maintained community events

Partnered, sponsored, or loosely related community events are not automatically in scope. Ask maintainers before adding ambiguous event types.

Do not expand the default scope to general attendees, rejected submissions, sponsor contacts, or other private/non-public roles unless the repository documentation is updated first.

## Identity Handling

Identity matching is sensitive. The same person may appear under different names, nicknames, romanizations, or GitHub handles across different years.

Use an appearance-first model:

- Preserve each public event appearance as its own record when needed.
- Link appearances to a GitHub username profile only when a maintainer has accepted that identity link.
- Maintainer judgment is allowed, especially during initial dataset construction.
- Preserve existing maintainer-approved identity links unless the user explicitly asks to review or change them.

Never merge identities automatically based only on:

- matching or similar display names
- matching or similar nicknames
- romanization similarity
- GitHub/account-name similarity
- memory from prior tasks
- LLM inference

If an identity match is uncertain, keep records separate and report the uncertainty.

Maintainer-approved means one of:

- an explicit instruction from a repository maintainer
- a merged pull request that makes or accepts the identity link
- a reviewed value in the canonical Sheet

Agent memory, similar names, unreviewed form submissions, or unreviewed Sheet rows are not maintainer approval.

## Privacy and Removal Policy

Historical records that were already published on official event websites are not hidden by default in this project.

People may request changes to the profile layer:

- remove biography, avatar, and links
- remove or change a preferred display name
- unlink historical appearances from a consolidated person profile
- correct wrong roles, event names, or source URLs

If a person does not want a consolidated profile, unlink the profile from the historical appearances instead of deleting the event records. If the original source is wrong, prefer correcting the source or documenting a better source.

Do not invent a policy that hides, deletes, or rewrites historical event records. If the user asks for a policy change, treat it as a documentation/policy change request and keep the distinction between event records and profile data explicit.

## Self-Service Profile PRs

Future automation may allow a contributor to update a profile file that corresponds to their own GitHub username. This is only appropriate for low-risk, opt-in profile fields such as preferred display name, biography, avatar, and public links.

Before any self-service PR may be auto-accepted, the repository should have validation that confirms:

- the PR author matches the GitHub username represented by the profile filename
- the PR changes only that contributor's own profile file
- the changed fields are limited to the approved profile schema
- the PR does not add, change, split, or infer historical appearance links
- the PR does not change historical event records, roles, source URLs, or event scope
- the PR does not process profile removal, unlinking, or privacy policy changes

Passing a filename or GitHub username check is not identity-merge approval. It must not be used to link appearances, consolidate profiles, or resolve source conflicts.

## Google Sheets Model

The expected operational sheets are:

- `appearances`: maintainer-edited public contribution appearances.
- `events`: maintainer-edited event metadata and event-level source URLs.
- `people`: a GitHub Actions-generated validation helper with only `github_username` and `display_name`.

Do not add a separate identity identifier for profile links. Historical appearances link to profile files through `github_username`.

Do not treat the `people` sheet as the canonical profile source. It is derived from GitHub repository profile files and exists only to help Google Sheets operators validate `appearances.github_username`.

Role fields are reader-facing labels:

- `role_group_zh` and `role_group_en` are broad public role labels.
- `role_title_zh` and `role_title_en` are public role titles.
- If an English role field is blank, English output should fall back to the corresponding Traditional Chinese field.
- Do not auto-translate missing English role fields.
- Do not create a data-quality report only because an English role field is blank.

Source URLs should usually live on `events`:

- Use `staff_source_url` for staff records.
- Use `speaker_source_url` for speaker records.
- Use `appearances.source_url_override` only when a specific appearance has a different source from the event-level source.

Repository tooling may manage Google Sheets structure, header notes, and validation rules from `config/sheets.json`. Use `pnpm` for all package-manager operations and package scripts. Do not use npm, yarn, or bun, and do not create or commit `package-lock.json`, `npm-shrinkwrap.json`, `yarn.lock`, `bun.lock`, or `bun.lockb`. LLM agents may run dry-run or static validation commands that do not read credentials, such as `pnpm sheets:init:dry-run` or `node --check scripts/sheets/init.mjs`. Do not run credentialed Google Sheets commands locally, such as `pnpm sheets:init`, unless the user explicitly asks for that exact action and the command can run without exposing secret contents.

## Data Minimization

Public historical records should only include data needed for the event contribution index, such as event name, year, role, public display name, source URL, and profile-link status.

Do not publish private email addresses, phone numbers, addresses, identity documents, internal contact information, non-opt-in social accounts, or unrelated private information.

Internal Google Workspace documents may be used as maintenance leads, but access to an internal document does not make its contents publishable. Data should be published only when it comes from a public event source, reviewed canonical data, or opt-in profile input.

## Human Review Required

Stop and ask a maintainer before making or accepting changes involving:

- adding, changing, or splitting a historical appearance link to a GitHub username profile
- expanding event scope beyond the documented scope
- expanding person scope beyond staff and speakers
- resolving a conflict between official websites, archives, old repos, Google Sheets, or other sources
- processing requests to remove profile data or unlink a profile from historical appearances
- changing the privacy, removal, or historical-record retention policy

Self-service profile PR automation must route the cases above to maintainer review instead of auto-accepting them.

LLM agents may identify candidates, summarize evidence, and mark items for review. They must not make the final decision for the cases above.

## Source and Access Limits

If you cannot access a Sheet, Form, source page, archive, or repo, say that the information is unknown or unavailable. Do not fill gaps from memory or inference.

When sources conflict, preserve the uncertainty and route the decision to maintainers. Do not silently choose the most convenient source.

If a source is outside this repository, do not claim that it has been corrected. You may document the discrepancy or propose a follow-up.

## Agent Operating Rules

- Inspect the current repository state before editing.
- Keep changes small, reviewable, and aligned with the existing documentation.
- Separate confirmed facts from inference when reporting data quality or identity issues.
- Do not invent people, roles, aliases, biographies, source URLs, event names, or profile links.
- Do not turn guesses into data. Mark uncertain records for human review instead.
- Do not overwrite maintainer-controlled Google Workspace assumptions unless the user asks for a policy change.
- Keep public-facing wording respectful and non-ranking. This project records and thanks contributors; it must not turn contribution history into a leaderboard.

## Documentation Expectations

- `README.md` is the friendly starting point for community members and maintainers.
- `AGENTS.md` is the local instruction entrypoint for LLM agents.
- Future technical docs should distinguish planned behavior from implemented behavior.
- When adding data model docs later, describe the minimum fields, source-of-truth rules, and maintenance flow before adding automation.
