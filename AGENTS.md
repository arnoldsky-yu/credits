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
- Google Sheets is the operational canonical dataset after records are collected and reviewed.
- GitHub Pages is the intended public output.
- GitHub Actions is the intended export/build path from the controlled dataset to the static site.

Do not describe planned infrastructure as already implemented. If a Sheet, Form, Action, schema, or deployment does not exist yet, document it as planned or `TBD`.

## Scope

The initial scope includes staff and speakers for SITCON-related events, including but not limited to:

- SITCON annual conferences
- SITCON Camp
- Hour of Code
- Hackathons
- Other SITCON-run or SITCON-maintained community events

Do not expand the default scope to general attendees, rejected submissions, sponsor contacts, or other private/non-public roles unless the repository documentation is updated first.

## Identity Handling

Identity matching is sensitive. The same person may appear under different names, nicknames, romanizations, or GitHub handles across different years.

Use an appearance-first model:

- Preserve each public event appearance as its own record when needed.
- Link appearances to a shared `person_id` only when a maintainer has accepted that identity merge.
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

## Privacy and Removal Policy

Historical records that were already published on official event websites are not hidden by default in this project.

People may request changes to the profile layer:

- remove biography, avatar, and links
- remove or change a preferred display name
- unlink historical appearances from a consolidated person profile
- correct wrong roles, event names, or source URLs

If a person does not want a consolidated profile, unlink the profile from the historical appearances instead of deleting the event records. If the original source is wrong, prefer correcting the source or documenting a better source.

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

