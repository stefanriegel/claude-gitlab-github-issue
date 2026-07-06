import type { GithubIssue, GithubComment } from '../../src/frontend/types';
import type { GithubMilestone } from './github.service';

type GitLabState = 'opened' | 'closed';
type GitLabMilestoneState = 'active' | 'closed';

interface GitLabUser {
  username: string;
  avatar_url: string | null;
}

interface GitLabMilestoneRaw {
  id: number;
  iid?: number;
  title: string;
  state: GitLabMilestoneState;
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
    milestone: issue.milestone ? { number: issue.milestone.id, title: issue.milestone.title } : null,
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
    number: m.id,
    title: m.title,
    state: m.state === 'closed' ? 'closed' : 'open',
    open_issues: 0,
    closed_issues: 0,
  };
}

export function normalizeGitlabIssuePatch(patch: Record<string, unknown>): Record<string, unknown> {
  const normalized = { ...patch };
  if (Array.isArray(normalized.labels)) normalized.labels = normalized.labels.join(',');
  if (normalized.state === 'closed') {
    delete normalized.state;
    normalized.state_event = 'close';
  }
  if (normalized.state === 'open') {
    delete normalized.state;
    normalized.state_event = 'reopen';
  }
  return normalized;
}

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
  return mapGitlabIssue(await gitlabFetch(
    baseUrl,
    token,
    'PUT',
    `/projects/${projectId(owner, repo)}/issues/${number}`,
    normalizeGitlabIssuePatch(patch),
  ) as GitLabIssueRaw);
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
  const stateParam = state === 'all' ? '' : `state=${state === 'open' ? 'active' : 'closed'}&`;
  const milestones = await gitlabFetch(baseUrl, token, 'GET', `/projects/${projectId(owner, repo)}/milestones?${stateParam}per_page=100`) as GitLabMilestoneRaw[];
  return milestones.map(mapGitlabMilestone);
}

export async function setIssueMilestone(baseUrl: string, token: string, owner: string, repo: string, issueNumber: number | string, milestoneNumber: number | null): Promise<GithubIssue> {
  return patchIssue(baseUrl, token, owner, repo, issueNumber, { milestone_id: milestoneNumber });
}

export async function createMilestone(baseUrl: string, token: string, owner: string, repo: string, title: string): Promise<GithubMilestone> {
  return mapGitlabMilestone(await gitlabFetch(baseUrl, token, 'POST', `/projects/${projectId(owner, repo)}/milestones`, { title }) as GitLabMilestoneRaw);
}
