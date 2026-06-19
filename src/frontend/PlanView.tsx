import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { GithubIssue, PlanData, PlanPhase } from './types';
import { usePluginAPI } from './PluginContext';
import { PlanCard } from './PlanCard';

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
  useEffect(() => {
    const schedule = () => { pollRef.current = setTimeout(() => { fetchPlan().then(schedule); }, POLL_INTERVAL_MS); };
    schedule();
    return () => { if (pollRef.current) clearTimeout(pollRef.current); };
  }, [fetchPlan]);

  const phaseKey = (p: PlanPhase) => p.milestoneNumber === null ? '__no_phase__' : String(p.milestoneNumber);

  const persistOrder = useCallback(async (phase: PlanPhase, issues: GithubIssue[]) => {
    // Optimistic: update local state, then PUT; refetch on failure.
    setData(prev => prev ? {
      phases: prev.phases.map(p => phaseKey(p) === phaseKey(phase) ? { ...p, issues } : p),
    } : prev);
    try {
      await api.rpc('PUT', `/plan/order?path=${encodeURIComponent(projectPath)}`, {
        phase: phase.title === 'No phase' ? null : phase.title,
        order: issues.map(i => i.number),
      });
    } catch {
      void fetchPlan();
    }
  }, [api, projectPath, fetchPlan]);

  const reorder = (phase: PlanPhase, from: number, to: number) => {
    if (to < 0 || to >= phase.issues.length) return;
    const next = phase.issues.slice();
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    void persistOrder(phase, next);
  };

  const handleDrop = (phase: PlanPhase, toIndex: number) => {
    const src = dragFrom.current;
    dragFrom.current = null;
    if (!src || src.phase !== phaseKey(phase)) return; // only reorder within the same phase
    if (src.index === toIndex) return;
    reorder(phase, src.index, toIndex);
  };

  if (notConfigured) return <div className="cgi-center"><div style={{ opacity: 0.5 }}>GitHub not configured. Open the ⚙ settings on the Issues Board tab.</div></div>;
  if (error) return <div className="cgi-center"><div className="cgi-error-text">{error}</div><button className="cgi-btn" onClick={fetchPlan}>Retry</button></div>;
  if (loading && !data) return <div className="cgi-center"><div className="cgi-spinner" /><div>Loading plan…</div></div>;
  if (!data) return null;
  if (data.phases.length === 0) return <div className="cgi-center"><div style={{ opacity: 0.5 }}>No issues yet.</div></div>;

  return (
    <div className="cgi-plan">
      {data.phases.map(phase => {
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
                  onMoveUp={() => reorder(phase, idx, idx - 1)}
                  onMoveDown={() => reorder(phase, idx, idx + 1)}
                  onDragStart={() => { dragFrom.current = { phase: phaseKey(phase), index: idx }; }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => handleDrop(phase, idx)}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
};
