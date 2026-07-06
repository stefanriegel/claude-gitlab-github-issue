--- name: github-task
description: Manage GitHub or GitLab issues as tasks -- list, move, comment, and order the Plan tab. Reads .GitHubBoard/github-sync.json in the current project. Use when the user invokes /github-task or asks to check tasks, move an issue, update a task, what needs testing, mark done, or reorder the plan.
---

# github-task skill

Read and manage GitHub or GitLab issues directly via the provider API using the project's stored token.

## Setup

```bash
TOKEN_FILE="$(find . -name 'github-sync.json' -path '*GitHubBoard*' 2>/dev/null | head -1)"
if [ -z "$TOKEN_FILE" ]; then echo "Configure Issues Board first."; exit 1; fi
PROVIDER=$(python3 -c "import json,sys; d=json.load(open(sys.argv[1])); print(d.get('provider','github'))" "$TOKEN_FILE")
BASE_URL=$(python3 -c "import json,sys; d=json.load(open(sys.argv[1])); print(d.get('baseUrl','https://gitlab.com').rstrip('/'))" "$TOKEN_FILE")
TOKEN=$(python3 -c "import json,sys; d=json.load(open(sys.argv[1])); print(d['token'])" "$TOKEN_FILE")
OWNER=$(python3 -c "import json,sys; d=json.load(open(sys.argv[1])); print(d['owner'])" "$TOKEN_FILE")
REPO=$(python3 -c "import json,sys; d=json.load(open(sys.argv[1])); print(d['repo'])" "$TOKEN_FILE")
GITHUB_API="https://api.github.com"
PROJECT_ID=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1], safe=''))" "$OWNER/$REPO")
```

If file missing incomplete, tell user configure Issues Board tab.

## Provider rules

- GitHub uses `https://api.github.com/repos/$OWNER/$REPO/issues`
- GitLab uses `$BASE_URL/api/v4/projects/$PROJECT_ID/issues`
- GitLab issue numbers use `iid`
- GitLab close/reopen uses `state_event=close` or `state_event=reopen`
- GitLab comments issue notes at `/projects/:id/issues/:iid/notes`

## Core operations

### List tasks

GitHub:

```bash
curl -s -H "Authorization: Bearer $TOKEN" -H "Accept: application/vnd.github+json" "$GITHUB_API/repos/$OWNER/$REPO/issues?state=open&per_page=100"
```

GitLab:

```bash
curl -s --header "PRIVATE-TOKEN: $TOKEN" "$BASE_URL/api/v4/projects/$PROJECT_ID/issues?state=opened&per_page=100"
```

### Move a task

GitHub updates labels; `done` closes issue. GitLab updates labels with `PUT /issues/:iid`; use `state_event=close` for done and `state_event=reopen` when reopening.

```bash
curl -s -X PUT --header "PRIVATE-TOKEN: $TOKEN" --data "labels=$NEW_LABELS" --data "state_event=close" "$BASE_URL/api/v4/projects/$PROJECT_ID/issues/$IID"
curl -s -X PUT --header "PRIVATE-TOKEN: $TOKEN" --data "labels=$NEW_LABELS" --data "state_event=reopen" "$BASE_URL/api/v4/projects/$PROJECT_ID/issues/$IID"
```

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
- When moving review, add both `review` and `need-testing`.
- When moving done, close the issue and add no labels.
- When the user asks for needs testing, list `need-testing`.
- When the user asks what's blocking, list `blocked`.
- When the user asks what's do or `sprawdź taski`, list to-do.
- When the user asks to update task message, post comment after confirm.
