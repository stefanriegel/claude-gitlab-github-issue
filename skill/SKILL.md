--- name: github-task
description: Manage GitHub or GitLab issues as tasks -- list, move, comment, and order the Plan tab. Reads .GitHubBoard/github-sync.json in the current project. Use when the user invokes /github-task or asks to check tasks, move an issue, update a task, what needs testing, mark done, or reorder the plan.
---

# github-task skill

Read and manage GitHub or GitLab issues via the provider API using the project's stored token.

## Setup

Find `.GitHubBoard/github-sync.json` in the project and read `provider`, `baseUrl`, `token`, `owner`, `repo`. If it is missing, tell the user to configure the Issues Board tab.

```bash
TOKEN_FILE="$(find . -name 'github-sync.json' -path '*GitHubBoard*' 2>/dev/null | head -1)"
if [ -z "$TOKEN_FILE" ]; then echo "Configure Issues Board first."; exit 1; fi
PROVIDER=$(python3 -c "import json,sys; d=json.load(open(sys.argv[1])); print(d.get('provider','github'))" "$TOKEN_FILE")
BASE_URL=$(python3 -c "import json,sys; d=json.load(open(sys.argv[1])); print(d.get('baseUrl','https://gitlab.com').rstrip('/'))" "$TOKEN_FILE")
TOKEN=$(python3 -c "import json,sys; d=json.load(open(sys.argv[1])); print(d['token'])" "$TOKEN_FILE")
OWNER=$(python3 -c "import json,sys; d=json.load(open(sys.argv[1])); print(d['owner'])" "$TOKEN_FILE")
REPO=$(python3 -c "import json,sys; d=json.load(open(sys.argv[1])); print(d['repo'])" "$TOKEN_FILE")
GITHUB_API=https://api.github.com
PROJECT_ID=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1], safe=''))" "$OWNER/$REPO")
```

## Status -> provider mapping

| Status | GitHub | GitLab |
| --- | --- | --- |
| to-do | open issue, no status labels | opened issue, no status labels |
| in-progress | open issue, add `in-progress` | opened issue, add `in-progress` |
| review | open issue, add `review` and `need-testing` | opened issue, add `review` and `need-testing` |
| blocked | open issue, add `blocked` | opened issue, add `blocked` |
| done | close issue, remove status labels | close issue, remove status labels |

Status labels: `in-progress`, `review`, `blocked`, `need-testing`.

## Operations

### List tasks

GitHub:

```bash
curl -s -H "Authorization: Bearer $TOKEN" -H "Accept: application/vnd.github+json" -H "X-GitHub-Api-Version: 2022-11-28" "$GITHUB_API/repos/$OWNER/$REPO/issues?state=open&per_page=100"
```

GitLab:

```bash
curl -s --header "PRIVATE-TOKEN: $TOKEN" "$BASE_URL/api/v4/projects/$PROJECT_ID/issues?state=opened&per_page=100"
```

### Move a task

GitHub updates labels; `done` closes the issue. Keep non-status labels.

GitLab updates labels with `PUT /issues/:iid`; use `state_event=close` for done and `state_event=reopen` when reopening.

GitLab issue numbers are `iid`.

### Add a comment

GitHub:

```bash
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Accept: application/vnd.github+json" -H "Content-Type: application/json" -d "{\"body\":\"$COMMENT_TEXT\"}" "$GITHUB_API/repos/$OWNER/$REPO/issues/$NUMBER/comments"
```

GitLab:

```bash
curl -s -X POST --header "PRIVATE-TOKEN: $TOKEN" --data-urlencode "body=$COMMENT_TEXT" "$BASE_URL/api/v4/projects/$PROJECT_ID/issues/$IID/notes"
```

## Behavior

- No confirmation needed for status moves.
- Confirm before closing sub-tasks if the user seems unsure.
- `review` adds both `review` and `need-testing`.
- `done` closes the issue and adds no labels.
- "needs testing" lists `need-testing`.
- "blocking" lists `blocked`.
- "what's to do" or `sprawdź taski` lists to-do.
- Task updates post a comment after confirm.

## Plan tab -- phases & ordering

The Plan tab groups issues by GitHub milestone (phase). Order is stored in `.GitHubBoard/plan.json`, and agents edit that file directly.

```json
{
  "<issue#>": { "order": 0, "phase": "<milestone title>" },
  "__phaseOrder__": ["<milestone title top-first>", "..."]
}
```

- `order` sets issue order within a phase. Lower is higher.
- Issues with no entry sort after ordered ones, by issue number.
- `__phaseOrder__` sets the manual order of phases. Phases not listed keep their provider milestone order after the ranked ones.
- Create or edit `.GitHubBoard/plan.json` directly; the backend reads it fresh on every load, and the user sees changes after Refresh.
- To reorder a phase, assign consecutive `order` values from 0 upward.
- To reorder phases, rewrite `__phaseOrder__`.
