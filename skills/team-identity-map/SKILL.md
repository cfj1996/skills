---
name: team-identity-map
description: Maintain and resolve teammate identity mappings across real names, enterprise WeChat, GitLab usernames, emails, phone numbers, and avatars. Use when a task needs to identify a person, translate between platform accounts, or update a team roster.
---

# Team Identity Map

## Use This Skill

Use this skill when a request mentions a teammate by one identifier and you need to resolve the matching identity on another platform.

Typical tasks:

- Map real name to enterprise WeChat account
- Map real name to GitLab username
- Find contact details for an identified teammate
- Update a team roster after a new screenshot or account change

## Workflow

1. Load the current roster from [`references/roster.md`](references/roster.md).
2. Match the request against the strongest available identifier:
   - real name
   - enterprise WeChat display name or profile screenshot
   - GitLab username
   - email or phone number
3. Return only the relevant mapping fields unless the user asks for the full record.
4. If identifiers conflict, prefer the most recent direct evidence from the user.
5. If the roster is incomplete, add a clearly marked TODO instead of guessing.

## Output Rules

- Keep responses concise and direct.
- Preserve Chinese names exactly as provided.
- Do not invent platform accounts, emails, or phone numbers.
- Treat screenshots as supporting evidence, not as a reason to overwrite confirmed roster data without notice.

## Maintenance

- Update the roster reference when a teammate changes name, account, or contact details.
- Keep one canonical record per person.
- If two entries appear to refer to the same person, reconcile them before adding a new row.
