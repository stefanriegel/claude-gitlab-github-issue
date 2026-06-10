# claude-github-issue

A [claudecodeui](https://github.com/claudecodeui/claudecodeui) plugin that adds a **GitHub Issues Kanban board** tab to your workspace, plus auto-installs the `/github-task` CLI skill for managing issues directly from Claude chat.

## Features

- Full kanban board with 5 columns: **To Do**, **In Progress**, **In Review**, **Blocked**, **Done**
- Collapsible columns (state persisted in localStorage)
- Click any issue card to open a detail modal with: full body, labels, assignees, comment history, move-to-column buttons, and add-comment form
- Auto-refreshes every 30 seconds
- Reads column assignment from GitHub labels — same mapping used by `/github-task`
- Dark and light theme support
- `/github-task` CLI skill auto-installed on first plugin load

## Installation

1. Open claudecodeui
2. Go to **Settings → Plugins**
3. Paste this repository URL:
   ```
   https://github.com/szmidtpiotr/claude-github-issue
   ```
4. Click **Install** — the plugin installs and appears as a new tab

No global configuration needed. Each project configures its own GitHub connection.

## Project Configuration

Create `.taskmaster/github-sync.json` in the root of any project you want to use with the board:

```json
{
  "token": "ghp_xxxxxxxxxxxxxxxxxxxx",
  "owner": "your-github-username",
  "repo": "your-repository-name",
  "enabled": true
}
```

**Generate a token:** GitHub → Settings → Developer settings → Personal access tokens → Generate new token (classic)

Required scopes: `repo` (full repository access for reading/writing issues and comments)

Switch to that project in claudecodeui — the board will load automatically.

## /github-task CLI Skill

When the plugin loads for the first time it installs the `/github-task` skill to `~/.claude/skills/github-task/SKILL.md`. This makes the following available in any Claude Code chat session:

```
/github-task
```

Example usage:
- `/github-task sprawdź taski` — list To Do column
- `/github-task przenieś #42 do in-progress`
- `/github-task what needs testing?`
- `/github-task update #17 — implemented the new login flow`

The skill reads config from `.taskmaster/github-sync.json` in the current project.

## Column → Label Mapping

| Column     | Trigger                          |
|------------|----------------------------------|
| To Do      | open issues, no status labels    |
| In Progress| has label `in-progress`          |
| In Review  | has label `review`               |
| Blocked    | has label `blocked`              |
| Done       | issue is closed                  |

Moving an issue via the board UI updates labels (and state for Done) via the GitHub API immediately.

## Screenshots

*(screenshots placeholder)*

## Development

```bash
git clone https://github.com/szmidtpiotr/claude-github-issue
cd claude-github-issue
npm install
npm run build
```

Output:
- `dist/frontend.js` — IIFE bundle with React included
- `dist/backend.js` — CommonJS Node.js server

## Contributing

PRs welcome. Please open an issue first to discuss significant changes.

## License

MIT
