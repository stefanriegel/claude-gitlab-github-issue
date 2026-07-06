# GitLab Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each project use GitHub, GitLab.com, or self-hosted GitLab issues in the existing board and Plan tab.

**Architecture:** Keep the existing UI issue shape. Extend project config with `provider` and `baseUrl`, add a GitLab adapter that maps GitLab API data into the existing shape, then route backend issue/plan operations through a tiny provider selector.

**Tech Stack:** TypeScript, Node 18 `fetch`, React 18, Vite, esbuild. No new dependencies.

## Global Constraints

- Missing `provider` means `"github"`.
- GitHub ignores `baseUrl` and continues using `https://api.github.com`.
- GitLab default `baseUrl` is `https://gitlab.com`.
- GitLab API base is `${baseUrl}/api/v4`.
- GitLab project id is `encodeURIComponent(owner + "/" + repo)`.
- Keep `/github-task` installed for compatibility.
- `dist/` must be committed after source changes.
- Do not rename every GitHub-named component/type in this pass.
- Do not add OAuth or token management outside `.GitHubBoard/github-sync.json`.

---

### Task 1: Config Provider Fields

**Files:**
- Modify: `src/backend/config.service.ts`
- Modify: `src/backend/server.ts`

**Interfaces:**
- Produces: `GithubConfig.provider?: 'github' | 'gitlab'`
- Produces: `GithubConfig.baseUrl?: string`
- Later tasks rely on `readConfig()` returning `provider: 'github'` when old config files omit it.

- [ ] **Step 1: Extend the config type and parser**

In `src/backend/config.service.ts`, change the interface and `readConfigFile` normalization to this shape:

```ts
export type IssueProvider = 'github' | 'gitlab';

export interface GithubConfig {
  provider: IssueProvider;
  baseUrl?: string;
  token: string;
  owner: string;
  repo: string;
  enabled: boolean;
  anthropicKey?: string;
}

function normalizeProvider(value: unknown): IssueProvider {
  return value === 'gitlab' ? 'gitlab' : 'github';
}

function normalizeBaseUrl(provider: IssueProvider, value: unknown): string | undefined {
  if (provider !== 'gitlab') return undefined;
  const raw = typeof value === 'string' && value.trim() ? value.trim() : 'https://gitlab.com';
  return raw.replace(/\/+$/, '');
}
```

Update the returned object in `readConfigFile()`:

```ts
const provider = normalizeProvider(parsed.provider);
return {
  provider,
  baseUrl: normalizeBaseUrl(provider, parsed.baseUrl),
  token: parsed.token,
  owner: parsed.owner,
  repo: parsed.repo,
  enabled: parsed.enabled !== false,
  anthropicKey: parsed.anthropicKey,
};
```

- [ ] **Step 2: Return provider metadata from GET /config**

In `src/backend/server.ts`, include provider fields in `handleGetConfig()`:

```ts
provider: config.provider,
baseUrl: config.baseUrl,
```

- [ ] **Step 3: Accept provider metadata in PUT /config**

In the `PUT /config` body type, add:

```ts
provider?: configService.IssueProvider;
baseUrl?: string;
```

Build `config` with normalized legacy-safe values:

```ts
const provider = body.provider === 'gitlab' ? 'gitlab' : 'github';
const config: configService.GithubConfig = {
  provider,
  baseUrl: provider === 'gitlab' ? (body.baseUrl?.trim().replace(/\/+$/, '') || 'https://gitlab.com') : undefined,
  token: body.token.trim(),
  owner: body.owner.trim(),
  repo: body.repo.trim(),
  enabled: body.enabled !== false,
  anthropicKey: body.anthropicKey?.trim() || existing?.anthropicKey || undefined,
};
```

- [ ] **Step 4: Verify**

Run:

```bash
npm run build
```

Expected: backend and frontend build successfully.

- [ ] **Step 5: Commit**

```bash
git add src/backend/config.service.ts src/backend/server.ts dist
git commit -m "feat: add issue provider config"
```

### Task 2: GitLab API Adapter And Mapping Check

**Files:**
- Create: `src/backend/gitlab.service.ts`
- Create: `src/backend/gitlab.service.selfcheck.ts`

**Interfaces:**
- Consumes: existing `GithubIssue`, `GithubComment` shape from `src/frontend/types.ts`
- Produces: GitLab service functions matching `github.service.ts`
- Later tasks call these exact functions: `listIssues`, `listIssueComments`, `getIssue`, `patchIssue`, `createIssue`, `createComment`, `listMilestones`, `setIssueMilestone`, `createMilestone`.

- [ ] **Step 1: Create the GitLab service**

Create `src/backend/gitlab.service.ts` with these exports and mapping helpers:

```ts
import type { GithubIssue, GithubComment } from '../../src/frontend/types';
import type { GithubMilestone } from './github.service';

type GitLabState = 'opened' | 'closed';

interface GitLabUser {
  username: string;
  avatar_url: string | null;
}

interface GitLabMilestoneRaw {
  id: number;
  iid?: number;
  title: string;
  state: GitLabState;
  due_date?: string | null;
}

interface GitLabIssueRaw {
  id: number;
  iid: number;
  title: string;
  description: string | null;
  state: GitLabState;
  labels: string[];
  assignees?: GitLabUser[];
  author: GitLabUser;
  created_at: string;
  updated_at: string;
  web_url: string;
  user_notes_count?: number;
  milestone?: GitLabMilestoneRaw | null;
}

interface GitLabNoteRaw {
  id: number;
  body: string;
  author: GitLabUser;
  created_at: string;
  system?: boolean;
}

function projectId(owner: string, repo: string): string {
  return encodeURIComponent(`${owner}/${repo}`);
}

function apiBase(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/api/v4`;
}

function headers(token: string): Record<string, string> {
  return {
    'PRIVATE-TOKEN': token,
    'Content-Type': 'application/json',
  };
}

export function mapGitlabIssue(issue: GitLabIssueRaw): GithubIssue {
  return {
    id: issue.id,
    number: issue.iid,
    title: issue.title,
    body: issue.description,
    state: issue.state === 'closed' ? 'closed' : 'open',
    labels: issue.labels.map((name, index) => ({ id: index, name, color: '64748b' })),
    assignees: (issue.assignees ?? []).map(u => ({ login: u.username, avatar_url: u.avatar_url ?? '' })),
    created_at: issue.created_at,
    updated_at: issue.updated_at,
    html_url: issue.web_url,
    user: { login: issue.author.username, avatar_url: issue.author.avatar_url ?? '' },
    comments: issue.user_notes_count ?? 0,
    milestone: issue.milestone ? { number: issue.milestone.iid ?? issue.milestone.id, title: issue.milestone.title } : null,
  };
}

export function mapGitlabComment(note: GitLabNoteRaw): GithubComment {
  return {
    id: note.id,
    body: note.body,
    user: { login: note.author.username, avatar_url: note.author.avatar_url ?? '' },
    created_at: note.created_at,
  };
}

export function mapGitlabMilestone(m: GitLabMilestoneRaw): GithubMilestone {
  return {
    number: m.iid ?? m.id,
    title: m.title,
    state: m.state === 'closed' ? 'closed' : 'open',
    open_issues: 0,
    closed_issues: 0,
  };
}
```

Then add `gitlabFetch()` and the service functions:

```ts
async function gitlabFetch(baseUrl: string, token: string, method: string, path: string, body?: unknown): Promise<unknown> {
  const opts: RequestInit = { method, headers: headers(token) };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(`${apiBase(baseUrl)}${path}`, opts);
  if (res.status === 204) return null;
  const json = await res.json() as unknown;
  if (!res.ok) {
    const msg = (json as { message?: string | string[] })?.message ?? JSON.stringify(json);
    throw new Error(`GitLab ${method} ${path} -> ${res.status}: ${Array.isArray(msg) ? msg.join(', ') : msg}`);
  }
  return json;
}

export async function listIssues(baseUrl: string, token: string, owner: string, repo: string, state: 'open' | 'closed' | 'all' = 'all'): Promise<GithubIssue[]> {
  const all: GithubIssue[] = [];
  let page = 1;
  const stateParam = state === 'all' ? 'all' : state === 'open' ? 'opened' : 'closed';
  while (true) {
    const batch = await gitlabFetch(baseUrl, token, 'GET', `/projects/${projectId(owner, repo)}/issues?state=${stateParam}&per_page=100&page=${page}`) as GitLabIssueRaw[];
    all.push(...batch.map(mapGitlabIssue));
    if (batch.length < 100) break;
    page++;
    if (page > 20) break;
  }
  return all;
}

export async function listIssueComments(baseUrl: string, token: string, owner: string, repo: string, issueNumber: number | string): Promise<GithubComment[]> {
  const notes = await gitlabFetch(baseUrl, token, 'GET', `/projects/${projectId(owner, repo)}/issues/${issueNumber}/notes?per_page=100`) as GitLabNoteRaw[];
  return notes.filter(n => !n.system).map(mapGitlabComment);
}

export async function getIssue(baseUrl: string, token: string, owner: string, repo: string, number: number | string): Promise<GithubIssue> {
  return mapGitlabIssue(await gitlabFetch(baseUrl, token, 'GET', `/projects/${projectId(owner, repo)}/issues/${number}`) as GitLabIssueRaw);
}

export async function patchIssue(baseUrl: string, token: string, owner: string, repo: string, number: number | string, patch: Record<string, unknown>): Promise<GithubIssue> {
  const body = { ...patch };
  if (body.state === 'closed') { delete body.state; body.state_event = 'close'; }
  if (body.state === 'open') { delete body.state; body.state_event = 'reopen'; }
  return mapGitlabIssue(await gitlabFetch(baseUrl, token, 'PUT', `/projects/${projectId(owner, repo)}/issues/${number}`, body) as GitLabIssueRaw);
}

export async function createIssue(baseUrl: string, token: string, owner: string, repo: string, title: string, body?: string, labels?: string[]): Promise<GithubIssue> {
  const payload: Record<string, unknown> = { title };
  if (body?.trim()) payload.description = body.trim();
  if (labels?.length) payload.labels = labels.join(',');
  return mapGitlabIssue(await gitlabFetch(baseUrl, token, 'POST', `/projects/${projectId(owner, repo)}/issues`, payload) as GitLabIssueRaw);
}

export async function createComment(baseUrl: string, token: string, owner: string, repo: string, issueNumber: number | string, body: string): Promise<GithubComment> {
  return mapGitlabComment(await gitlabFetch(baseUrl, token, 'POST', `/projects/${projectId(owner, repo)}/issues/${issueNumber}/notes`, { body }) as GitLabNoteRaw);
}

export async function listMilestones(baseUrl: string, token: string, owner: string, repo: string, state: 'open' | 'closed' | 'all' = 'all'): Promise<GithubMilestone[]> {
  const stateParam = state === 'all' ? 'all' : state === 'open' ? 'active' : 'closed';
  const milestones = await gitlabFetch(baseUrl, token, 'GET', `/projects/${projectId(owner, repo)}/milestones?state=${stateParam}&per_page=100`) as GitLabMilestoneRaw[];
  return milestones.map(mapGitlabMilestone);
}

export async function setIssueMilestone(baseUrl: string, token: string, owner: string, repo: string, issueNumber: number | string, milestoneNumber: number | null): Promise<GithubIssue> {
  return patchIssue(baseUrl, token, owner, repo, issueNumber, { milestone_id: milestoneNumber });
}

export async function createMilestone(baseUrl: string, token: string, owner: string, repo: string, title: string): Promise<GithubMilestone> {
  return mapGitlabMilestone(await gitlabFetch(baseUrl, token, 'POST', `/projects/${projectId(owner, repo)}/milestones`, { title }) as GitLabMilestoneRaw);
}
```

- [ ] **Step 2: Add the self-check**

Create `src/backend/gitlab.service.selfcheck.ts`:

```ts
import assert from 'node:assert/strict';
import { mapGitlabIssue, mapGitlabComment, mapGitlabMilestone } from './gitlab.service';

const issue = mapGitlabIssue({
  id: 10,
  iid: 7,
  title: 'Fix login',
  description: 'body',
  state: 'opened',
  labels: ['in-progress', 'priority:high'],
  assignees: [{ username: 'stefan', avatar_url: null }],
  author: { username: 'ana', avatar_url: 'https://example.com/a.png' },
  created_at: '2026-07-01T00:00:00Z',
  updated_at: '2026-07-02T00:00:00Z',
  web_url: 'https://gitlab.example.com/group/project/-/issues/7',
  user_notes_count: 3,
  milestone: { id: 99, iid: 4, title: 'MVP', state: 'opened' },
});

assert.equal(issue.number, 7);
assert.equal(issue.state, 'open');
assert.equal(issue.labels[1]?.name, 'priority:high');
assert.equal(issue.milestone?.number, 4);
assert.equal(issue.comments, 3);

const comment = mapGitlabComment({
  id: 5,
  body: 'done',
  author: { username: 'sam', avatar_url: null },
  created_at: '2026-07-03T00:00:00Z',
});

assert.equal(comment.user.login, 'sam');
assert.equal(comment.body, 'done');

const milestone = mapGitlabMilestone({ id: 12, title: 'Later', state: 'closed' });
assert.equal(milestone.number, 12);
assert.equal(milestone.state, 'closed');

console.log('gitlab.service selfcheck ok');
```

- [ ] **Step 3: Verify**

Run:

```bash
npx esbuild src/backend/gitlab.service.selfcheck.ts --bundle --platform=node --target=node18 --format=cjs --outfile=/tmp/gitlab-service-selfcheck.cjs && node /tmp/gitlab-service-selfcheck.cjs
npm run build
```

Expected: first command prints `gitlab.service selfcheck ok`; build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/backend/gitlab.service.ts src/backend/gitlab.service.selfcheck.ts dist
git commit -m "feat: add GitLab issue adapter"
```

### Task 3: Backend Provider Wiring

**Files:**
- Create: `src/backend/issue-provider.ts`
- Modify: `src/backend/issues.service.ts`
- Modify: `src/backend/plan.controller.ts`

**Interfaces:**
- Consumes: `GithubConfig.provider`, `GithubConfig.baseUrl`
- Consumes: GitHub and GitLab service functions
- Produces: typed provider wrapper functions for issue and milestone operations

- [ ] **Step 1: Add the provider selector**

Create `src/backend/issue-provider.ts`:

```ts
import * as github from './github.service';
import * as gitlab from './gitlab.service';
import type { GithubConfig } from './config.service';
import type { GithubIssue, GithubComment } from '../../src/frontend/types';

type IssueState = 'open' | 'closed' | 'all';

function gitlabBase(config: GithubConfig): string {
  return config.baseUrl ?? 'https://gitlab.com';
}

export function providerCacheKey(config: GithubConfig): string {
  if (config.provider === 'gitlab') {
    return `gitlab:${gitlabBase(config)}:${config.owner}/${config.repo}`;
  }
  return `github:api.github.com:${config.owner}/${config.repo}`;
}

export async function listProviderIssues(config: GithubConfig, state: IssueState = 'all'): Promise<GithubIssue[]> {
  return config.provider === 'gitlab'
    ? gitlab.listIssues(gitlabBase(config), config.token, config.owner, config.repo, state)
    : github.listIssues(config.token, config.owner, config.repo, state);
}

export async function listProviderComments(config: GithubConfig, issueNumber: string | number): Promise<GithubComment[]> {
  return config.provider === 'gitlab'
    ? gitlab.listIssueComments(gitlabBase(config), config.token, config.owner, config.repo, issueNumber)
    : github.listIssueComments(config.token, config.owner, config.repo, issueNumber);
}

export async function getProviderIssue(config: GithubConfig, issueNumber: string | number): Promise<GithubIssue> {
  return config.provider === 'gitlab'
    ? gitlab.getIssue(gitlabBase(config), config.token, config.owner, config.repo, issueNumber)
    : github.getIssue(config.token, config.owner, config.repo, issueNumber);
}

export async function patchProviderIssue(config: GithubConfig, issueNumber: string | number, patch: Record<string, unknown>): Promise<GithubIssue> {
  return config.provider === 'gitlab'
    ? gitlab.patchIssue(gitlabBase(config), config.token, config.owner, config.repo, issueNumber, patch)
    : github.patchIssue(config.token, config.owner, config.repo, issueNumber, patch);
}

export async function createProviderIssue(config: GithubConfig, title: string, body?: string, labels?: string[]): Promise<GithubIssue> {
  return config.provider === 'gitlab'
    ? gitlab.createIssue(gitlabBase(config), config.token, config.owner, config.repo, title, body, labels)
    : github.createIssue(config.token, config.owner, config.repo, title, body, labels);
}

export async function createProviderComment(config: GithubConfig, issueNumber: string | number, body: string): Promise<GithubComment> {
  return config.provider === 'gitlab'
    ? gitlab.createComment(gitlabBase(config), config.token, config.owner, config.repo, issueNumber, body)
    : github.createComment(config.token, config.owner, config.repo, issueNumber, body);
}

export async function listProviderMilestones(config: GithubConfig, state: IssueState = 'all'): Promise<github.GithubMilestone[]> {
  return config.provider === 'gitlab'
    ? gitlab.listMilestones(gitlabBase(config), config.token, config.owner, config.repo, state)
    : github.listMilestones(config.token, config.owner, config.repo, state);
}

export async function setProviderIssueMilestone(config: GithubConfig, issueNumber: string | number, milestoneNumber: number | null): Promise<GithubIssue> {
  return config.provider === 'gitlab'
    ? gitlab.setIssueMilestone(gitlabBase(config), config.token, config.owner, config.repo, issueNumber, milestoneNumber)
    : github.setIssueMilestone(config.token, config.owner, config.repo, issueNumber, milestoneNumber);
}

export async function createProviderMilestone(config: GithubConfig, title: string): Promise<github.GithubMilestone> {
  return config.provider === 'gitlab'
    ? gitlab.createMilestone(gitlabBase(config), config.token, config.owner, config.repo, title)
    : github.createMilestone(config.token, config.owner, config.repo, title);
}
```

- [ ] **Step 2: Wire `issues.service.ts`**

Replace direct `github.*` calls with wrapper calls from `issue-provider.ts`.

```ts
const raw = await listProviderIssues(config, 'all');
```

Apply the same wrapper pattern to comments, create issue, get issue, patch issue, and milestones.

Use cache keys:

```ts
const cacheKey = `issues:${providerCacheKey(config)}`;
```

and:

```ts
cacheDeletePrefix(`issues:${providerCacheKey(config)}`);
cacheDeletePrefix(`milestones:${providerCacheKey(config)}`);
cacheDeletePrefix(`comments:${providerCacheKey(config)}:${issueNumber}`);
```

Change not-configured copy to:

```ts
const err = new Error('Issue provider not configured for this project') as Error & { notConfigured: boolean };
```

- [ ] **Step 3: Wire `plan.controller.ts`**

Remove the direct import from `./github.service`.

Use the provider wrappers inside `assignPhase()` and `bootstrap()`:

```ts
await setProviderIssueMilestone(config, issueNumber, milestoneNumber);
```

For bootstrap, use `listProviderMilestones(config, 'all')`, `createProviderMilestone(config, title)`,
and `setProviderIssueMilestone(config, issueNumber, num)`.

Change not-configured copy to:

```ts
const err = new Error('Issue provider not configured') as Error & { notConfigured?: boolean };
```

- [ ] **Step 4: Verify**

Run:

```bash
npx esbuild src/backend/gitlab.service.selfcheck.ts --bundle --platform=node --target=node18 --format=cjs --outfile=/tmp/gitlab-service-selfcheck.cjs && node /tmp/gitlab-service-selfcheck.cjs
npm run build
```

Expected: self-check and build pass.

- [ ] **Step 5: Commit**

```bash
git add src/backend/issue-provider.ts src/backend/issues.service.ts src/backend/plan.controller.ts dist
git commit -m "feat: route backend through issue providers"
```

### Task 4: Settings UI Provider Support

**Files:**
- Modify: `src/frontend/SettingsModal.tsx`
- Modify: `src/frontend/App.tsx`

**Interfaces:**
- Consumes: `GET /config` fields `provider`, `baseUrl`
- Produces: `PUT /config` fields `provider`, `baseUrl`

- [ ] **Step 1: Extend settings form state**

In `SettingsModal.tsx`, update `ConfigState`:

```ts
interface ConfigState {
  provider: 'github' | 'gitlab';
  baseUrl: string;
  token: string;
  owner: string;
  repo: string;
  anthropicKey: string;
}
```

Initialize:

```ts
const [form, setForm] = useState<ConfigState>({
  provider: 'github',
  baseUrl: 'https://gitlab.com',
  token: '',
  owner: '',
  repo: '',
  anthropicKey: '',
});
```

- [ ] **Step 2: Load provider fields**

Change the config response type:

```ts
const d = res as {
  configured?: boolean;
  provider?: 'github' | 'gitlab';
  baseUrl?: string;
  owner?: string;
  repo?: string;
  hasToken?: boolean;
  hasAnthropicKey?: boolean;
};
```

Set provider and base URL:

```ts
provider: d.provider ?? 'github',
baseUrl: d.baseUrl ?? 'https://gitlab.com',
```

- [ ] **Step 3: Save provider fields**

In `handleSave()`, change the token error text:

```ts
setError(`${form.provider === 'gitlab' ? 'GitLab' : 'GitHub'} token is required.`);
```

Add `provider` and `baseUrl` to the `PUT /config` body:

```ts
provider: form.provider,
baseUrl: form.provider === 'gitlab' ? form.baseUrl.trim() || 'https://gitlab.com' : undefined,
```

- [ ] **Step 4: Add provider controls**

Add this block before the token input:

```tsx
<div>
  <label style={labelStyle}>Provider</label>
  <select
    value={form.provider}
    onChange={e => setForm(f => ({ ...f, provider: e.target.value as 'github' | 'gitlab' }))}
    style={inputStyle}
  >
    <option value="github">GitHub</option>
    <option value="gitlab">GitLab</option>
  </select>
</div>

{form.provider === 'gitlab' && (
  <div>
    <label style={labelStyle}>GitLab Base URL</label>
    <input
      type="url"
      value={form.baseUrl}
      onChange={e => setForm(f => ({ ...f, baseUrl: e.target.value }))}
      placeholder="https://gitlab.com"
      style={inputStyle}
      autoComplete="off"
    />
  </div>
)}
```

Change labels/placeholders with simple ternaries:

```tsx
<label style={labelStyle}>{form.provider === 'gitlab' ? 'GitLab Access Token' : 'GitHub Personal Access Token'}</label>
```

```tsx
<label style={labelStyle}>{form.provider === 'gitlab' ? 'Group / Subgroup' : 'Repository Owner (username or org)'}</label>
```

```tsx
placeholder={form.provider === 'gitlab' ? 'group/subgroup' : 'your-github-username'}
```

```tsx
placeholder={form.provider === 'gitlab' ? 'project-name' : 'your-repository-name'}
```

- [ ] **Step 5: Make App not-configured copy provider-neutral**

In `App.tsx`, change the error includes check to:

```ts
if (msg.includes('not configured') || msg.includes('Issue provider not configured')) {
```

- [ ] **Step 6: Verify**

Run:

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/frontend/SettingsModal.tsx src/frontend/App.tsx dist
git commit -m "feat: configure GitHub or GitLab per project"
```

### Task 5: Docs, Skill, Dist, And Final Checks

**Files:**
- Modify: `README.md`
- Modify: `skill/SKILL.md`
- Modify: `manifest.json` if plugin display text still says GitHub-only
- Modify: `CLAUDE.md` if its setup notes are GitHub-only and now misleading
- Modify: `dist/backend.js`
- Modify: `dist/frontend.js`

**Interfaces:**
- Consumes: final source behavior from Tasks 1-4
- Produces: committed plugin distribution

- [ ] **Step 1: Update README config docs**

Add three examples under project configuration:

```json
{
  "provider": "github",
  "token": "ghp_...",
  "owner": "owner",
  "repo": "repo",
  "enabled": true
}
```

```json
{
  "provider": "gitlab",
  "baseUrl": "https://gitlab.com",
  "token": "glpat-...",
  "owner": "group/subgroup",
  "repo": "project",
  "enabled": true
}
```

```json
{
  "provider": "gitlab",
  "baseUrl": "https://gitlab.example.com",
  "token": "glpat-...",
  "owner": "group/subgroup",
  "repo": "project",
  "enabled": true
}
```

Document token scopes:

```md
Required token scopes:
- GitHub: `repo`
- GitLab: `api`
```

- [ ] **Step 2: Update `/github-task` skill for GitLab**

In `skill/SKILL.md`, keep the skill name `github-task`, but update setup to read `provider` and `baseUrl`.

Add shell setup:

```bash
PROVIDER=$(python3 -c "import json; d=json.load(open('$TOKEN_FILE')); print(d.get('provider','github'))")
BASE_URL=$(python3 -c "import json; d=json.load(open('$TOKEN_FILE')); print(d.get('baseUrl','https://gitlab.com').rstrip('/'))")
```

Add GitLab rules:

```md
For GitLab, use `$BASE_URL/api/v4/projects/$PROJECT_ID/issues`, where
`PROJECT_ID` is URL-encoded `owner/repo`. GitLab issue numbers are `iid`.
Closing/reopening uses `state_event=close` or `state_event=reopen`.
Comments are issue notes: `/projects/:id/issues/:iid/notes`.
```

- [ ] **Step 3: Update plugin copy only where cheap**

If `manifest.json` still says GitHub-only, change:

```json
"displayName": "Issues Board",
"description": "Kanban board for GitHub or GitLab issues with per-project configuration and /github-task CLI skill auto-install"
```

Do not rename package name, route paths, localStorage keys, component filenames, or `/github-task`.

- [ ] **Step 4: Build dist**

Run:

```bash
npx esbuild src/backend/gitlab.service.selfcheck.ts --bundle --platform=node --target=node18 --format=cjs --outfile=/tmp/gitlab-service-selfcheck.cjs && node /tmp/gitlab-service-selfcheck.cjs
npm run build
git status --short
```

Expected:
- self-check prints `gitlab.service selfcheck ok`
- build succeeds
- `dist/backend.js` and/or `dist/frontend.js` are modified if source changed

- [ ] **Step 5: Commit**

```bash
git add README.md skill/SKILL.md manifest.json CLAUDE.md dist
git commit -m "docs: document GitLab provider support"
```

- [ ] **Step 6: Final manual smoke checklist**

Do not call external APIs unless the user provides tokens. Verify from code/build:

```bash
npm run build
git log --oneline --max-count=8
git status --short
```

Expected: build succeeds; working tree clean except allowed scratch files under `.superpowers/`.
