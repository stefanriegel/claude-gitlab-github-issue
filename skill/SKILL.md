---
name: github-task
description: Manage GitHub Issues as tasks — list, move between columns, update with comments. Reads GitHub config from .GitHubBoard/github-sync.json in the current project. Use when the user invokes /github-task or asks to "check tasks", "move issue to in-progress", "update task", "what needs testing", "mark done", "sprawdź taski", "przenieś task", "zaktualizuj task".
---

# github-task skill

Read and manage GitHub Issues directly via the GitHub API using the project's stored token.

## Setup — read config

First, find and read `.GitHubBoard/github-sync.json` in the current project:

```bash
cat .GitHubBoard/github-sync.json 2>/dev/null || find . -name "github-sync.json" -path "*GitHubBoard*" 2>/dev/null | head -1 | xargs cat
```

Extract: `token`, `owner`, `repo`. If missing → tell user to configure in the GitHub Issues Board tab (click the ⚙ gear icon).

Set shell variables:
```bash
TOKEN="<token from config>"
OWNER="<owner>"
REPO="<repo>"
BASE="https://api.github.com"
AUTH="-H \"Authorization: Bearer $TOKEN\" -H \"Accept: application/vnd.github+json\" -H \"X-GitHub-Api-Version: 2022-11-28\""
```

## Status → GitHub mapping

| Column      | GitHub state | Labels to ADD              | Labels to REMOVE (status labels) |
|-------------|-------------|----------------------------|----------------------------------|
| to-do       | open        | *(none)*                   | in-progress, review, blocked, need-testing |
| in-progress | open        | in-progress                | review, blocked, need-testing    |
| review      | open        | review, need-testing       | in-progress, blocked             |
| blocked     | open        | blocked                    | in-progress, review, need-testing |
| done        | **closed**  | *(none)*                   | *(close the issue)*              |

Status labels (never show in visible label list): `in-progress`, `review`, `blocked`, `need-testing`

## Operations

### List tasks in a column

Fetch open issues:
```bash
curl -s $AUTH "$BASE/repos/$OWNER/$REPO/issues?state=open&per_page=100"
```

Filter by column:
- **to-do**: open issues with NO status labels
- **in-progress**: has label `in-progress`
- **review / need-testing**: has label `review` or `need-testing`
- **blocked**: has label `blocked`

Show as a numbered list: `#123 [priority] Title — assignee`

Closed issues (done): use `?state=closed&per_page=50`

### Move issue to new status

1. Get current issue labels:
```bash
curl -s $AUTH "$BASE/repos/$OWNER/$REPO/issues/$NUMBER" | python3 -c "import json,sys; i=json.load(sys.stdin); print(' '.join(l['name'] for l in i['labels']))"
```

2. Compute new labels: keep non-status labels, add new status label(s)

3. PATCH the issue:
```bash
# For status changes (not done):
curl -s -X PATCH $AUTH -H "Content-Type: application/json" \
  -d "{\"labels\": $NEW_LABELS_JSON}" \
  "$BASE/repos/$OWNER/$REPO/issues/$NUMBER"

# For done (close):
curl -s -X PATCH $AUTH -H "Content-Type: application/json" \
  -d "{\"state\": \"closed\"}" \
  "$BASE/repos/$OWNER/$REPO/issues/$NUMBER"
```

4. Confirm success with issue title and new status.

### Update issue (add comment)

Post a comment to the issue:
```bash
curl -s -X POST $AUTH -H "Content-Type: application/json" \
  -d "{\"body\": \"$COMMENT_TEXT\"}" \
  "$BASE/repos/$OWNER/$REPO/issues/$NUMBER/comments"
```

Include context from the user's update — what changed, what was done, what's next.

## Behavior rules

- **No confirmation needed** for status moves — execute directly and report what was done
- **Do confirm** before closing (done) if the issue has open sub-tasks or the user seems unsure
- When moving to **review**: always add BOTH `review` AND `need-testing` labels
- When moving to **done**: close the issue (state=closed), do NOT add any labels
- When user asks "what needs testing" → list issues with `need-testing` label
- When user asks "what's blocking" → list issues with `blocked` label
- When user asks "what's to do" or "sprawdź taski" → list to-do column
- When user asks to **update** a task with a message → post a comment with that message, then confirm

## Response format after each operation

```
✓ #123 — "Issue title"
  Status: in-progress → review
  Labels added: review, need-testing
  Labels removed: in-progress
```

Or for comment:
```
✓ #123 — "Issue title"
  Comment posted: "your message"
```

Keep responses short. List multiple issues as a compact table. No markdown prose.

## Screenshot pipeline — attach a screen to an issue comment

You can capture a live screenshot of the DEV app and post it directly as a GitHub issue comment. Three steps:

### Step 1 — Take the screenshot

Use the `/game-screen` skill:

```
/game-screen               → heroes screen (default)
/game-screen campaign 999  → gameplay for campaign 999
/game-screen death 999     → death screen for campaign 999
```

The skill saves the PNG to `temp-img/<timestamp>_game_screen.png` on the Claude VM.

### Step 2 — Upload image to GitHub

Upload as a release asset to get a public URL:

```bash
# Use the latest release tag (check with: gh release list --repo $OWNER/$REPO)
gh release upload <tag> <path-to-png> --repo $OWNER/$REPO --clobber

# Get the download URL
gh release view <tag> --repo $OWNER/$REPO --json assets \
  --jq '.assets[] | select(.name == "<filename>") | .url'
```

### Step 3 — Post comment with image

```bash
gh issue comment <NUMBER> --repo $OWNER/$REPO \
  --body "![screenshot](<download-url>)"
```

### Full example

```bash
TOKEN_FILE=$(find . -name "github-sync.json" -path "*GitHubBoard*" 2>/dev/null | head -1)
OWNER=$(python3 -c "import json; d=json.load(open('$TOKEN_FILE')); print(d['owner'])")
REPO=$(python3 -c "import json; d=json.load(open('$TOKEN_FILE')); print(d['repo'])")

# After /game-screen runs and saves to e.g. temp-img/1234_game_screen.png:
FILE="temp-img/1234_game_screen.png"
FNAME=$(basename $FILE)
TAG=$(gh release list --repo $OWNER/$REPO --limit 1 --json tagName --jq '.[0].tagName')

gh release upload $TAG $FILE --repo $OWNER/$REPO --clobber
URL=$(gh release view $TAG --repo $OWNER/$REPO --json assets \
  --jq ".assets[] | select(.name == \"$FNAME\") | .url")

gh issue comment <NUMBER> --repo $OWNER/$REPO --body "![screenshot]($URL)"
```
