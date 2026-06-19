import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { GithubIssue, PlanData, PlanPhase } from './types';
import { usePluginAPI } from './PluginContext';
import { PlanCard } from './PlanCard';
import { PlanBootstrapModal } from './PlanBootstrapModal';

const POLL_INTERVAL_MS = 30_000;

interface PlanViewProps {
  projectPath: string;
  onOpenIssue: (issue: GithubIssue) => void;
}

export const PlanView: React.FC<PlanViewProps> = ({ projectPath, onOpenIssue }) => {
  const api = usePluginAPI();
  const [data, setData] = useState<PlanData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);
  const dragFrom = useRef<{ phase: string; index: number } | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dataRef = useRef<PlanData | null>(null);
  const [showBootstrap, setShowBootstrap] = useState(false);

  const fetchPlan = useCallback(async () => {
    if (!projectPath) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.rpc('GET', `/plan?path=${encodeURIComponent(projectPath)}`) as
        PlanData & { error?: string; notConfigured?: boolean };
      if (res.notConfigured) { setNotConfigured(true); setData(null); }
      else if (res.error) { setError(res.error); }
      else { setNotConfigured(false); setData({ phases: res.phases ?? [] }); }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load plan');
    } finally {
      setLoading(false);
    }
  }, [api, projectPath]);

  useEffect(() => { fetchPlan(); }, [fetchPlan]);
  useEffect(() => { dataRef.current = data; }, [data]);
  useEffect(() => {
    const schedule = () => { pollRef.current = setTimeout(() => { fetchPlan().then(schedule); }, POLL_INTERVAL_MS); };
    schedule();
    return () => { if (pollRef.current) clearTimeout(pollRef.current); };
  }, [fetchPlan]);

  const phaseKey = (p: PlanPhase) => p.milestoneNumber === null ? '__no_phase__' : String(p.milestoneNumber);

  // Compute the new order for one phase from current state, persist optimistically, PUT.
  const applyReorder = useCallback((phaseId: string, mutate: (issues: GithubIssue[]) => GithubIssue[]) => {
    const current = dataRef.current;
    if (!current) return;
    let payload: { phaseTitle: string | null; order: number[] } | null = null;
    const phases = current.phases.map(p => {
      if (phaseKey(p) !== phaseId) return p;
      const issues = mutate(p.issues.slice());
      payload = { phaseTitle: p.milestoneNumber === null ? null : p.title, order: issues.map(i => i.number) };
      return { ...p, issues };
    });
    if (!payload) return;
    setData({ phases });
    const body = payload;
    void (async () => {
      try {
        await api.rpc('PUT', `/plan/order?path=${encodeURIComponent(projectPath)}`, {
          phase: body.phaseTitle,
          order: body.order,
        });
      } catch {
        void fetchPlan();
      }
    })();
  }, [api, projectPath, fetchPlan]);

  // Move the card at `from` to `to` (arrow buttons pass adjacent indices).
  const reorder = (phaseId: string, from: number, to: number) => {
    applyReorder(phaseId, issues => {
      if (to < 0 || to >= issues.length) return issues;
      const next = issues.slice();
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  // Native drag drop onto a target card. Insert-before semantics; corrects the
  // downward off-by-one (removing the source above the target shifts indices).
  const handleDrop = (phaseId: string, toIndex: number) => {
    const src = dragFrom.current;
    dragFrom.current = null;
    if (!src || src.phase !== phaseId) return;
    const to = src.index < toIndex ? toIndex - 1 : toIndex;
    if (src.index === to) return;
    reorder(phaseId, src.index, to);
  };

  if (notConfigured) return <div className="cgi-center"><div style={{ opacity: 0.5 }}>GitHub not configured. Open the ⚙ settings on the Issues Board tab.</div></div>;
  if (error) return <div className="cgi-center"><div className="cgi-error-text">{error}</div><button className="cgi-btn" onClick={fetchPlan}>Retry</button></div>;
  if (loading && !data) return <div className="cgi-center"><div className="cgi-spinner" /><div>Loading plan…</div></div>;
  if (!data) return null;

  return (
    <div className="cgi-plan">
      <div className="cgi-plan-toolbar">
        <button className="cgi-btn" onClick={() => setShowBootstrap(true)}>Bootstrap phases</button>
        <button className="cgi-btn" onClick={fetchPlan} disabled={loading}>{loading ? '↻ Refreshing…' : '↻ Refresh'}</button>
      </div>
      {data.phases.length === 0 ? (
        <div className="cgi-center"><div style={{ opacity: 0.5 }}>No issues yet.</div></div>
      ) : (
        data.phases.map(phase => {
          const pct = phase.total > 0 ? Math.round((phase.closed / phase.total) * 100) : 0;
          return (
            <section key={phaseKey(phase)} className="cgi-plan-phase">
              <header className="cgi-plan-phase-head">
                <span className="cgi-plan-phase-title">{phase.title}</span>
                <span className="cgi-plan-phase-count">{phase.closed}/{phase.total}</span>
                <span className="cgi-plan-progress"><span className="cgi-plan-progress-bar" style={{ width: `${pct}%` }} /></span>
              </header>
              <div className="cgi-plan-list">
                {phase.issues.map((issue, idx) => (
                  <PlanCard
                    key={issue.number}
                    issue={issue}
                    index={idx}
                    count={phase.issues.length}
                    onOpen={onOpenIssue}
                    onMoveUp={() => reorder(phaseKey(phase), idx, idx - 1)}
                    onMoveDown={() => reorder(phaseKey(phase), idx, idx + 1)}
                    onDragStart={() => { dragFrom.current = { phase: phaseKey(phase), index: idx }; }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => handleDrop(phaseKey(phase), idx)}
                  />
                ))}
              </div>
            </section>
          );
        })
      )}
      {showBootstrap && (
        <PlanBootstrapModal
          projectPath={projectPath}
          onClose={() => setShowBootstrap(false)}
          onDone={() => { setShowBootstrap(false); void fetchPlan(); }}
        />
      )}
    </div>
  );
};
