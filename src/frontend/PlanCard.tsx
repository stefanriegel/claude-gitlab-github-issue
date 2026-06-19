import React from 'react';
import type { GithubIssue } from './types';
import { detectPriorityFromLabels } from './priorityUtils';

const PRIORITY_COLORS: Record<string, string> = {
  high: '#ef4444', medium: '#f59e0b', low: '#6b7280',
};

interface PlanCardProps {
  issue: GithubIssue;
  index: number;
  count: number;
  onOpen: (issue: GithubIssue) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
}

export const PlanCard: React.FC<PlanCardProps> = ({
  issue, index, count, onOpen, onMoveUp, onMoveDown, onDragStart, onDragOver, onDrop,
}) => {
  const priority = detectPriorityFromLabels(issue.labels);
  const isBug = issue.labels.some(l => l.name.toLowerCase() === 'bug');
  const done = issue.state === 'closed';
  // Open but already implemented (post-/tdd, awaiting verification/close) — mark
  // distinctly so it is not accidentally picked up for rework.
  const inReview = !done && issue.labels.some(l =>
    ['review', 'needs-testing'].includes(l.name.toLowerCase()));

  return (
    <div
      className={`cgi-plan-card${done ? ' done' : ''}${inReview ? ' in-review' : ''}`}
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <span className="cgi-plan-drag" title="Drag to reorder">⠿</span>
      {priority && (
        <span className="cgi-plan-dot" style={{ background: PRIORITY_COLORS[priority] }} />
      )}
      <button className="cgi-plan-card-main" onClick={() => onOpen(issue)}>
        <span className="cgi-plan-num">#{issue.number}</span>
        <span className="cgi-plan-title">{issue.title}</span>
        {inReview && <span className="cgi-plan-review" title="Zrobione — czeka na weryfikację/zamknięcie">✓ w review</span>}
        {isBug && <span className="cgi-plan-bug">bug</span>}
      </button>
      <span className="cgi-plan-reorder">
        <button className="cgi-plan-arrow" disabled={index === 0} onClick={onMoveUp} title="Move up">▲</button>
        <button className="cgi-plan-arrow" disabled={index === count - 1} onClick={onMoveDown} title="Move down">▼</button>
      </span>
    </div>
  );
};
