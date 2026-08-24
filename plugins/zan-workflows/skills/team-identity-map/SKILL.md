---
name: team-identity-map
description: Use when a task needs to identify a teammate, translate between real names, enterprise WeChat clues and GitLab usernames, or maintain the packaged team roster.
---

# Team Identity Map

Default model profile: `FAST`. Read the shared
[model-routing policy](../../references/model-routing.md) only when identity
evidence conflicts or the request expands beyond a bounded lookup.

## Use This Skill

Use this skill when a request mentions a teammate by one identifier and you need to resolve the matching identity on another platform.

Typical tasks:

- Map real name to enterprise WeChat account
- Map real name to GitLab username
- Look up private contact details for an identified teammate at runtime
- Update a team roster after a new screenshot or account change

## Workflow

1. Load the current roster from [`references/roster.md`](references/roster.md).
2. Match the request against the strongest persisted identifier:
   - real name
   - enterprise WeChat display name or profile screenshot
   - GitLab username
3. If the request needs private contact details such as email or phone, identify the teammate first,
   then query the enterprise directory at runtime. Never copy private contact details into the roster.
4. Return only the relevant mapping fields unless the user asks for the full record.
5. If identifiers conflict, prefer the most recent direct evidence from the user.
6. If the roster is incomplete, add a clearly marked TODO instead of guessing.

## Output Rules

- Keep responses concise and direct.
- Preserve Chinese names exactly as provided.
- Do not invent platform accounts or private contact details.
- Query private contact details from the enterprise directory only when needed at runtime; do not
  persist them in the skill, roster, prompts, logs, or generated artifacts.
- Treat screenshots as supporting evidence, not as a reason to overwrite confirmed roster data without notice.

## Maintenance

- Update the roster reference when a teammate changes real name, enterprise WeChat clue, or GitLab username.
- Keep one canonical record per person.
- If two entries appear to refer to the same person, reconcile them before adding a new row.
- Never add email addresses, phone numbers, or other private contact details to the packaged roster.
