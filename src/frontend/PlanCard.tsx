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

  return (
    <div
      className={`cgi-plan-card${done ? ' done' : ''}`}
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
        {isBug && <span className="cgi-plan-bug">bug</span>}
      </button>
      <span className="cgi-plan-reorder">
        <button className="cgi-plan-arrow" disabled={index === 0} onClick={onMoveUp} title="Move up">▲</button>
        <button className="cgi-plan-arrow" disabled={index === count - 1} onClick={onMoveDown} title="Move down">▼</button>
      </span>
    </div>
  );
};
