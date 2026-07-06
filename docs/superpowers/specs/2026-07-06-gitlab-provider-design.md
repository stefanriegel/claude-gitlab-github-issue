# GitLab Provider Design

## Goal

Let each project use either GitHub or GitLab issues in the existing board and Plan tab.
GitLab must support both `gitlab.com` and self-hosted instances by storing a per-project
`baseUrl`.

## Non-Goals

- Rename every GitHub-named component/type in this pass.
- Add a second board UI.
- Add OAuth or token management outside the existing per-project config file.

## Existing Shape

The plugin stores project config in `.GitHubBoard/github-sync.json`, reads it through
`config.service.ts`, and routes board operations through `issues.service.ts`.
The UI already consumes one issue shape with fields like `number`, `labels`, `html_url`,
`comments`, and `milestone`.

## Config

Extend the existing config without breaking old projects:

```json
{
  "provider": "gitlab",
  "baseUrl": "https://gitlab.example.com",
  "token": "glpat-...",
  "owner": "group/subgroup",
  "repo": "project",
  "enabled": true,
  "anthropicKey": "sk-ant-api03-..."
}
```

Rules:

- Missing `provider` means `"github"`.
- GitHub ignores `baseUrl` and continues using `https://api.github.com`.
- GitLab default `baseUrl` is `https://gitlab.com`.
- GitLab API base is `${baseUrl}/api/v4`.
- GitLab project id is `encodeURIComponent(owner + "/" + repo)`.

## Backend

Add `src/backend/gitlab.service.ts` with functions matching the current GitHub service
surface:

- `listIssues`
- `listIssueComments`
- `getIssue`
- `patchIssue`
- `createIssue`
- `createComment`
- `listMilestones`
- `setIssueMilestone`
- `createMilestone`

Keep `issues.service.ts` and `plan.controller.ts` as the main orchestration points. They
choose GitHub or GitLab from `config.provider`, then call the matching service.

GitLab response mapping:

- `iid` -> `number`
- `web_url` -> `html_url`
- string labels -> `{ id: 0, name, color: "64748b" }`
- `author` -> `user`
- `user_notes_count` -> `comments`
- `milestone.iid` or `milestone.id` -> `milestone.number`
- issue notes -> existing comment shape

State changes:

- GitHub keeps the existing `state` patch.
- GitLab uses `state_event: "close"` or `"reopen"` when board columns move an issue
  into or out of Done.

Cache keys must include provider and GitLab base URL:

```text
issues:<provider>:<baseUrl-or-github>:<owner>/<repo>
milestones:<provider>:<baseUrl-or-github>:<owner>/<repo>
comments:<provider>:<baseUrl-or-github>:<owner>/<repo>:<issue>
```

## Frontend

Update Settings only:

- Add provider selector: GitHub / GitLab.
- Show `baseUrl` only for GitLab, defaulting to `https://gitlab.com`.
- Keep owner and repo fields, but label GitLab owner as group/subgroup.
- Send `provider` and `baseUrl` to `PUT /config`.

Keep the board, cards, modal, Plan tab, and priority logic on the existing issue shape.
Change user-visible text that says GitHub only when it appears in shared UI paths.

## Skill And Docs

Keep `/github-task` installed for compatibility in this pass. Update its docs so it can
read `provider` and call either GitHub or GitLab.

Update README with:

- GitHub config example.
- GitLab.com config example.
- Self-hosted GitLab config example.
- Token scope notes: GitHub `repo`; GitLab `api`.

## Tests And Checks

Add the smallest runnable checks:

- A small mapping self-check for GitLab issue/comment/milestone conversion.
- `npm run build`.

Manual smoke test:

- Existing GitHub config still loads.
- GitLab config loads issues.
- Move issue across status labels.
- Close and reopen through Done.
- Add comment.
- Plan tab loads milestones.

## Implementation Order

1. Extend config type/read/write and settings payload.
2. Add GitLab service and mapping self-check.
3. Add provider selection in issue operations.
4. Add provider selection in plan operations.
5. Update Settings UI.
6. Update README and `/github-task`.
7. Build and smoke the changed paths.
