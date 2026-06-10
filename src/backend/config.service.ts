import path from 'path';
import { promises as fs } from 'fs';

const SYNC_FILE = '.taskmaster/github-sync.json';

export interface GithubConfig {
  token: string;
  owner: string;
  repo: string;
  enabled: boolean;
}

export async function readConfig(projectPath: string): Promise<GithubConfig | null> {
  if (!projectPath) return null;
  const filePath = path.join(projectPath, SYNC_FILE);
  try {
    const content = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(content) as Partial<GithubConfig>;
    if (!parsed.token || !parsed.owner || !parsed.repo) return null;
    return {
      token: parsed.token,
      owner: parsed.owner,
      repo: parsed.repo,
      enabled: parsed.enabled !== false,
    };
  } catch {
    return null;
  }
}
