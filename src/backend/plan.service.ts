import path from 'path';
import { promises as fs } from 'fs';

const PLAN_FILE = '.GitHubBoard/plan.json';

export interface PlanEntry {
  order: number;
  phase?: string;
}

export interface PlanStore {
  [issueNumber: string]: PlanEntry;
}

/** Read the order store. Returns {} if missing or corrupt (graceful, like readConfig → null). */
export async function readPlan(projectPath: string): Promise<PlanStore> {
  if (!projectPath) return {};
  const filePath = path.join(projectPath, PLAN_FILE);
  try {
    const content = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(content) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as PlanStore;
  } catch {
    return {};
  }
}

async function writePlan(projectPath: string, store: PlanStore): Promise<void> {
  if (!projectPath) throw new Error('projectPath required');
  const dir = path.join(projectPath, '.GitHubBoard');
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(projectPath, PLAN_FILE);
  await fs.writeFile(filePath, JSON.stringify(store, null, 2), 'utf8');
}

/**
 * Persist a new order for one phase: the given issue numbers get order 0..n-1
 * and (optionally) their phase tag updated. Other issues are left untouched.
 */
export async function setOrder(
  projectPath: string,
  phase: string | null,
  issueNumbers: number[]
): Promise<PlanStore> {
  const store = await readPlan(projectPath);
  issueNumbers.forEach((num, idx) => {
    const key = String(num);
    const existing = store[key] ?? { order: idx };
    store[key] = { order: idx, phase: phase ?? existing.phase };
  });
  await writePlan(projectPath, store);
  return store;
}
