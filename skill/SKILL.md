---
name: github-task
description: Manage GitHub or GitLab Issues tasks -- list, move between columns, update comments, and order the Plan tab. Reads project config from .GitHubBoard/github-sync.json in the current project. Use when the user invokes /github-task or asks to "check tasks", "move issue to in-progress", "update task", "what needs testing", "mark done", "sprawdź taski", "przenieś task", "zaktualizuj task", or to order/rank the Plan board.
---

# github-task skill

Read and manage GitHub or GitLab issues directly via the provider API using the project's stored token.

## Setup

Read `.GitHubBoard/github-sync.json` in the current project:

```bash
cat .GitHubBoard/github-sync.json 2>/dev/null || find . -name "github-sync.json" -path "*GitHubBoard*" 2>/dev/null | head -1 | xargs cat
```

Extract: `provider`, `baseUrl`, `token`, `owner`, `repo`. If missing, tell user to configure in the Issues Board tab.

Set shell variables:

```bash
PROVIDER=$(python3 -c "import json; d=json.load(open('$TOKEN_FILE')); print(d.get('provider','github'))") BASE_URL=$(python3 -c "import json; d=json.load(open('$TOKEN_FILE')); print(d.get('baseUrl','https://gitlab.com').rstrip('/'))")
TOKEN="<token from config>"
OWNER="<owner>"
REPO="<repo>"
BASE="https://api.github.com"
AUTH="-H \"Authorization: Bearer $TOKEN\" -H \"Accept: application/vnd.github+json\" -H \"X-GitHub-Api-Version: 2022-11-28\""
```

## GitLab rules

For GitLab, use `$BASE_URL/api/v4/projects/$PROJECT_ID/issues`, where `PROJECT_ID` URL-encoded `owner/repo`. GitLab issue numbers are `iid`. Closing/reopening uses `state_event=close` or `state_event=reopen`. Comments are issue notes: `/projects/:id/issues/:iid/notes`.

Use `PROJECT_ID=$(python3 -c "import urllib.parse; print(urllib.parse.quote(f'{OWNER}/{REPO}', safe=''))")` when the provider is GitLab.

## Status mapping

| Column | GitHub state | Labels to add | Labels to remove |
|---|---|---|---|
| to-do | open | none | in-progress, review, blocked, need-testing |
| in-progress | open | in-progress | review, blocked, need-testing |
| review | open | review, need-testing | in-progress, blocked |
| blocked | open | blocked | in-progress, review, need-testing |
| done | closed | none | close the issue |

## Operations

Use the GitHub API examples below for GitHub; for GitLab, swap to the GitLab issue path above and use `iid`.

### List tasks

```bash
curl -s $AUTH "$BASE/repos/$OWNER/$REPO/issues?state=open&per_page=100"
```

### Move a task

```bash
curl -s $AUTH "$BASE/repos/$OWNER/$REPO/issues/$NUMBER" | python3 -c "import json,sys; i=json.load(sys.stdin); print(' '.join(l['name'] for l in i['labels']))"
```

```bash
curl -s -X PATCH $AUTH -H "Content-Type: application/json" \
  -d "{\"labels\": $NEW_LABELS_JSON}" \
  "$BASE/repos/$OWNER/$REPO/issues/$NUMBER"
```

### Add a comment

```bash
curl -s -X POST $AUTH -H "Content-Type: application/json" \
  -d "{\"body\": \"$COMMENT_TEXT\"}" \
  "$BASE/repos/$OWNER/$REPO/issues/$NUMBER/comments"
```

## Behavior

- No confirmation needed for status moves.
- Confirm before closing if sub-tasks are open and the user seems unsure.
- When moving to review, add both `review` and `need-testing`.
- When moving to done, close the issue and add no labels.
- When the user asks what needs testing, list `need-testing`.
- When the user asks what's blocking, list `blocked`.
- When the user asks what's to do or `sprawdź taski`, list to-do.
- When the user asks to update a task message, post the comment and confirm.
