import path from 'path';
import { promises as fs } from 'fs';

const SYNC_FILE = '.GitHubBoard/github-sync.json';

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

export async function writeConfig(projectPath: string, config: GithubConfig): Promise<void> {
  if (!projectPath) throw new Error('projectPath required');
  const dir = path.join(projectPath, '.GitHubBoard');
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(projectPath, SYNC_FILE);
  await fs.writeFile(filePath, JSON.stringify(config, null, 2), 'utf8');
}
