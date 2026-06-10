import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { IssuesData, GithubIssue } from './types';
import { columnChangePatch } from './types';
import { usePluginAPI } from './PluginContext';
import { GithubBoard } from './GithubBoard';
import { GithubIssueModal } from './GithubIssueModal';
import { ConfigBanner } from './ConfigBanner';
import { SettingsModal } from './SettingsModal';

const POLL_INTERVAL_MS = 30_000;
const STORAGE_KEY = 'cgi-collapsed-columns';

function loadCollapsed(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveCollapsed(set: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
  } catch {
    // ignore
  }
}

export const App: React.FC = () => {
  const api = usePluginAPI();
  const [data, setData] = useState<IssuesData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);
  const [collapsedColumns, setCollapsedColumns] = useState<Set<string>>(loadCollapsed);
  const [selectedIssue, setSelectedIssue] = useState<GithubIssue | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const theme = api.context.theme;
  const project = api.context.project;
  const fetchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchIssues = useCallback(async () => {
    if (!project?.path) {
      setNotConfigured(false);
      setData(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.rpc('GET', `/issues?path=${encodeURIComponent(project.path)}`);
      const d = res as { issues?: GithubIssue[]; columns?: IssuesData['columns']; error?: string; notConfigured?: boolean };
      if (d.notConfigured || d.error?.includes('not configured')) {
        setNotConfigured(true);
        setData(null);
      } else if (d.error) {
        setError(d.error);
      } else {
        setNotConfigured(false);
        setData({ issues: d.issues ?? [], columns: d.columns ?? [] });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load issues';
      if (msg.includes('not configured') || msg.includes('GitHub not configured')) {
        setNotConfigured(true);
        setData(null);
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, [api, project?.path]);

  // Fetch on mount and on context change
  useEffect(() => {
    fetchIssues();
    const unsubscribe = api.onContextChange(() => {
      fetchIssues();
    });
    return unsubscribe;
  }, [fetchIssues, api]);

  // Polling
  useEffect(() => {
    const schedule = () => {
      fetchRef.current = setTimeout(() => {
        fetchIssues().then(schedule);
      }, POLL_INTERVAL_MS);
    };
    schedule();
    return () => {
      if (fetchRef.current !== null) clearTimeout(fetchRef.current);
    };
  }, [fetchIssues]);

  const handleToggleColumn = (id: string) => {
    setCollapsedColumns(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveCollapsed(next);
      return next;
    });
  };

  const handleMoveIssue = async (issueNumber: number, newColumnId: string) => {
    if (!project?.path || !data) return;
    const issue = data.issues.find(i => i.number === issueNumber);
    if (!issue) return;

    const patch = columnChangePatch(
      issue.state === 'closed' ? 'done' : (issue.labels.find(l => ['in-progress','review','blocked'].includes(l.name))?.name ?? 'todo'),
      newColumnId
    );
    if (!patch) return;

    try {
      const res = await api.rpc('PATCH', `/issues/${issueNumber}?path=${encodeURIComponent(project.path)}`, patch);
      const d = res as { ok: boolean; issue: GithubIssue };
      if (d.ok && d.issue) {
        setData(prev => prev ? {
          ...prev,
          issues: prev.issues.map(i => i.number === issueNumber ? d.issue : i),
        } : prev);
      }
    } catch {
      // Silently fail, board will re-sync on next poll
    }
  };

  const handleIssueUpdated = (updated: GithubIssue) => {
    setData(prev => prev ? {
      ...prev,
      issues: prev.issues.map(i => i.number === updated.number ? updated : i),
    } : prev);
    setSelectedIssue(updated);
  };

  const projectPath = project?.path ?? '';
  const repoInfo = (data as unknown as { owner?: string; repo?: string }) ?? {};

  return (
    <div className={`cgi-root cgi-${theme}`} style={{ background: 'var(--cgi-bg)', color: 'var(--cgi-text)' }}>
      {/* Toolbar */}
      <div className="cgi-toolbar" style={{ background: 'var(--cgi-surface)' }}>
        <div className="cgi-toolbar-title">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z" />
          </svg>
          GitHub Issues Board
          {repoInfo.owner && repoInfo.repo && (
            <span style={{ fontWeight: 400, opacity: 0.6, fontSize: 12 }}>
              {repoInfo.owner}/{repoInfo.repo}
            </span>
          )}
        </div>
        <div className="cgi-toolbar-actions">
          {data && (
            <span style={{ fontSize: 11, opacity: 0.55 }}>
              {data.issues.length} issues
            </span>
          )}
          <button
            className="cgi-btn"
            onClick={fetchIssues}
            disabled={loading}
            title="Refresh issues"
          >
            {loading ? '↻ Refreshing...' : '↻ Refresh'}
          </button>
          {project && (
            <button
              className="cgi-btn"
              onClick={() => setShowSettings(true)}
              title="GitHub Issues Board settings"
              style={{ padding: '4px 8px' }}
            >
              ⚙
            </button>
          )}
        </div>
      </div>

      {/* Main content */}
      {!project ? (
        <div className="cgi-center">
          <div style={{ opacity: 0.5 }}>No project open.</div>
          <div style={{ fontSize: 12, opacity: 0.4 }}>Open a project to view its GitHub Issues.</div>
        </div>
      ) : notConfigured ? (
        <ConfigBanner onOpenSettings={() => setShowSettings(true)} />
      ) : loading && !data ? (
        <div className="cgi-center">
          <div className="cgi-spinner" />
          <div>Loading issues...</div>
        </div>
      ) : error ? (
        <div className="cgi-center">
          <div className="cgi-error-text">{error}</div>
          <button className="cgi-btn" onClick={fetchIssues}>Retry</button>
        </div>
      ) : data ? (
        <GithubBoard
          data={data}
          collapsedColumns={collapsedColumns}
          onToggleColumn={handleToggleColumn}
          onMoveIssue={handleMoveIssue}
          onOpenIssue={setSelectedIssue}
        />
      ) : null}

      {/* Issue modal */}
      {selectedIssue && project && (
        <GithubIssueModal
          issue={selectedIssue}
          projectPath={projectPath}
          onClose={() => setSelectedIssue(null)}
          onIssueUpdated={handleIssueUpdated}
        />
      )}

      {/* Settings modal */}
      {showSettings && project && (
        <SettingsModal
          projectPath={projectPath}
          onClose={() => setShowSettings(false)}
          onSaved={() => {
            setNotConfigured(false);
            setShowSettings(false);
            void fetchIssues();
          }}
        />
      )}
    </div>
  );
};
