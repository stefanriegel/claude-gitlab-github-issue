import React from 'react';
import type { GithubIssue } from './types';
import { COLUMNS, issueToColumnId } from './types';
import type { IssuePriority } from './priorityUtils';
import { GithubKanbanColumn } from './GithubKanbanColumn';

interface Props {
  issues: GithubIssue[];
  priorityMap: Map<number, IssuePriority>;
  collapsedColumns: Set<string>;
  onToggleColumn: (id: string) => void;
  onMoveIssue: (issueNumber: number, newColumnId: string) => void;
  onOpenIssue: (issue: GithubIssue) => void;
}

export const GithubBoard: React.FC<Props> = ({
  issues,
  priorityMap,
  collapsedColumns,
  onToggleColumn,
  onOpenIssue,
}) => {
  const issuesByColumn = React.useMemo(() => {
    const map = new Map<string, GithubIssue[]>();
    for (const col of COLUMNS) map.set(col.id, []);
    for (const issue of issues) {
      const colId = issueToColumnId(issue);
      const arr = map.get(colId);
      if (arr) arr.push(issue);
    }
    return map;
  }, [issues]);

  const gridTemplate = COLUMNS.map(col =>
    collapsedColumns.has(col.id) ? '52px' : 'minmax(0, 1fr)'
  ).join(' ');

  return (
    <div className="cgi-board" style={{ gridTemplateColumns: gridTemplate }}>
      {COLUMNS.map(col => (
        <GithubKanbanColumn
          key={col.id}
          column={col}
          issues={issuesByColumn.get(col.id) ?? []}
          priorityMap={priorityMap}
          collapsed={collapsedColumns.has(col.id)}
          onToggle={() => onToggleColumn(col.id)}
          onOpenIssue={onOpenIssue}
        />
      ))}
    </div>
  );
};
