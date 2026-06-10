import React, { useState, useEffect, useCallback } from 'react';
import type { GithubIssue, GithubComment } from './types';
import { COLUMNS, issueToColumnId, columnChangePatch } from './types';
import { usePluginAPI } from './PluginContext';

interface Props {
  issue: GithubIssue;
  projectPath: string;
  onClose: () => void;
  onIssueUpdated: (updated: GithubIssue) => void;
}

function formatDate(isoString: string): string {
  try {
    return new Date(isoString).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  } catch {
    return isoString;
  }
}

export const GithubIssueModal: React.FC<Props> = ({ issue, projectPath, onClose, onIssueUpdated }) => {
  const api = usePluginAPI();
  const [comments, setComments] = useState<GithubComment[]>([]);
  const [loadingComments, setLoadingComments] = useState(true);
  const [commentText, setCommentText] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [movingTo, setMovingTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentIssue, setCurrentIssue] = useState<GithubIssue>(issue);

  const currentColumnId = issueToColumnId(currentIssue);

  const loadComments = useCallback(async () => {
    setLoadingComments(true);
    try {
      const res = await api.rpc('GET', `/issues/${currentIssue.number}/comments?path=${encodeURIComponent(projectPath)}`);
      const data = res as { comments: GithubComment[] };
      setComments(data.comments ?? []);
    } catch (e) {
      // Non-fatal
    } finally {
      setLoadingComments(false);
    }
  }, [api, currentIssue.number, projectPath]);

  useEffect(() => {
    loadComments();
  }, [loadComments]);

  // Close on Escape key
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleMoveToColumn = async (colId: string) => {
    if (colId === currentColumnId || movingTo) return;
    setMovingTo(colId);
    setError(null);
    try {
      const patch = columnChangePatch(currentColumnId, colId);
      if (!patch) return;
      const res = await api.rpc('PATCH', `/issues/${currentIssue.number}?path=${encodeURIComponent(projectPath)}`, patch);
      const data = res as { ok: boolean; issue: GithubIssue };
      if (data.ok && data.issue) {
        setCurrentIssue(data.issue);
        onIssueUpdated(data.issue);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to move issue');
    } finally {
      setMovingTo(null);
    }
  };

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim() || submittingComment) return;
    setSubmittingComment(true);
    setError(null);
    try {
      await api.rpc('POST', `/issues/${currentIssue.number}/comments?path=${encodeURIComponent(projectPath)}`, {
        body: commentText.trim(),
      });
      setCommentText('');
      await loadComments();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to post comment');
    } finally {
      setSubmittingComment(false);
    }
  };

  return (
    <div className="cgi-modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="cgi-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="cgi-modal-header">
          <div style={{ flex: 1 }}>
            <div className="cgi-modal-title">{currentIssue.title}</div>
            <div className="cgi-modal-subtitle">
              #{currentIssue.number} · opened by {currentIssue.user.login} on {formatDate(currentIssue.created_at)}
              {currentIssue.state === 'closed' && <span style={{ marginLeft: 8, color: '#10b981', fontWeight: 600 }}>● Closed</span>}
            </div>
          </div>
          <a
            href={currentIssue.html_url}
            target="_blank"
            rel="noopener noreferrer"
            className="cgi-btn"
            title="Open on GitHub"
            style={{ textDecoration: 'none', flexShrink: 0 }}
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z" />
            </svg>
            GitHub
          </a>
          <button className="cgi-modal-close" onClick={onClose} title="Close">✕</button>
        </div>

        <div className="cgi-modal-body">
          {/* Labels */}
          {currentIssue.labels.length > 0 && (
            <div>
              <div className="cgi-modal-section-label">Labels</div>
              <div className="cgi-card-labels">
                {currentIssue.labels.map(l => (
                  <span
                    key={l.id}
                    className="cgi-label-chip"
                    style={{
                      background: `#${l.color}`,
                      color: parseInt(l.color, 16) > 0x888888 ? '#000' : '#fff',
                      fontSize: 12,
                      padding: '2px 8px',
                    }}
                  >
                    {l.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Body */}
          {currentIssue.body && (
            <div>
              <div className="cgi-modal-section-label">Description</div>
              <pre className="cgi-issue-body">{currentIssue.body}</pre>
            </div>
          )}

          {/* Column selector */}
          <div>
            <div className="cgi-modal-section-label">Move to column</div>
            <div className="cgi-column-selector">
              {COLUMNS.map(col => {
                const isActive = col.id === issueToColumnId(currentIssue);
                return (
                  <button
                    key={col.id}
                    className={`cgi-column-btn${isActive ? ' cgi-column-btn-active' : ''}`}
                    style={isActive ? { background: col.accentColor, borderColor: col.accentColor } : {}}
                    onClick={() => handleMoveToColumn(col.id)}
                    disabled={isActive || movingTo !== null}
                  >
                    {movingTo === col.id ? '...' : col.title}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Error */}
          {error && <div className="cgi-error-text">{error}</div>}

          {/* Comments */}
          <div>
            <div className="cgi-modal-section-label">
              Comments {!loadingComments && `(${comments.length})`}
            </div>
            {loadingComments ? (
              <div style={{ color: 'var(--cgi-text-muted)', fontSize: 12 }}>Loading comments...</div>
            ) : comments.length > 0 ? (
              <div className="cgi-comments-list">
                {comments.map(c => (
                  <div key={c.id} className="cgi-comment">
                    <div className="cgi-comment-header">
                      <img src={c.user.avatar_url} alt={c.user.login} className="cgi-avatar" />
                      <span className="cgi-comment-author">{c.user.login}</span>
                      <span>·</span>
                      <span>{formatDate(c.created_at)}</span>
                    </div>
                    <div className="cgi-comment-body">{c.body}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ color: 'var(--cgi-text-muted)', fontSize: 12 }}>No comments yet.</div>
            )}
          </div>

          {/* Add comment */}
          <div>
            <div className="cgi-modal-section-label">Add comment</div>
            <form className="cgi-comment-form" onSubmit={handleSubmitComment}>
              <textarea
                className="cgi-textarea"
                placeholder="Write a comment..."
                value={commentText}
                onChange={e => setCommentText(e.target.value)}
                disabled={submittingComment}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="submit"
                  className="cgi-btn cgi-btn-primary"
                  disabled={!commentText.trim() || submittingComment}
                >
                  {submittingComment ? 'Posting...' : 'Post comment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
