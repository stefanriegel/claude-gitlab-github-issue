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
