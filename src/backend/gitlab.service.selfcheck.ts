import assert from 'node:assert/strict';
import { mapGitlabIssue, mapGitlabComment, mapGitlabMilestone, normalizeGitlabIssuePatch } from './gitlab.service';

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
  milestone: { id: 99, iid: 4, title: 'MVP', state: 'active' },
});

assert.equal(issue.number, 7);
assert.equal(issue.state, 'open');
assert.equal(issue.labels[1]?.name, 'priority:high');
assert.equal(issue.milestone?.number, 99);
assert.equal(issue.comments, 3);

const comment = mapGitlabComment({
  id: 5,
  body: 'done',
  author: { username: 'sam', avatar_url: null },
  created_at: '2026-07-03T00:00:00Z',
});

assert.equal(comment.user.login, 'sam');
assert.equal(comment.body, 'done');

const milestone = mapGitlabMilestone({ id: 12, iid: 3, title: 'Later', state: 'closed' });
assert.equal(milestone.number, 12);
assert.equal(milestone.state, 'closed');

assert.deepEqual(
  normalizeGitlabIssuePatch({ state: 'closed', labels: ['a', 'b'] }),
  { labels: 'a,b', state_event: 'close' },
);

console.log('gitlab.service selfcheck ok');
