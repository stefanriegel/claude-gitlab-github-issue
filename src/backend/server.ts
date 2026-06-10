import http from 'http';
import path from 'path';
import fs from 'fs';
import { URL } from 'url';
import * as issuesService from './issues.service';
import * as configService from './config.service';

// ---- Auto-install /github-task skill ----
function installSkill(): void {
  try {
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    if (!homeDir) return;
    const skillDir = path.join(homeDir, '.claude', 'skills', 'github-task');
    const skillFile = path.join(skillDir, 'SKILL.md');
    if (!fs.existsSync(skillFile)) {
      fs.mkdirSync(skillDir, { recursive: true });
      // __dirname in CJS points to dist/ directory
      const sourceSkill = path.join(__dirname, '..', 'skill', 'SKILL.md');
      if (fs.existsSync(sourceSkill)) {
        fs.copyFileSync(sourceSkill, skillFile);
        console.log('[claude-github-issue] Installed /github-task skill to', skillFile);
      } else {
        console.log('[claude-github-issue] Skill source not found at', sourceSkill, '— skipping auto-install');
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[claude-github-issue] Could not install skill:', msg);
  }
}

installSkill();

// ---- Helpers ----
function parseQuery(rawUrl: string): Record<string, string> {
  try {
    const u = new URL(rawUrl, 'http://localhost');
    const result: Record<string, string> = {};
    u.searchParams.forEach((v, k) => { result[k] = v; });
    return result;
  } catch {
    return {};
  }
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(json),
    'Access-Control-Allow-Origin': '*',
  });
  res.end(json);
}

function matchRoute(method: string, pathname: string, pattern: RegExp): RegExpMatchArray | null {
  if (method !== pattern.source.split(' ')[0]) return null;
  return pathname.match(new RegExp(pattern.source.split(' ').slice(1).join(' ')));
}

// ---- Route handlers ----
async function handleGetIssues(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const query = parseQuery(req.url ?? '');
  const projectPath = query['path'] ?? '';
  if (!projectPath) {
    sendJson(res, 400, { error: 'path query parameter required' });
    return;
  }
  try {
    const result = await issuesService.fetchIssues(projectPath);
    sendJson(res, 200, result);
  } catch (e) {
    const err = e as Error & { notConfigured?: boolean };
    if (err.notConfigured) {
      sendJson(res, 200, { notConfigured: true, error: err.message });
    } else {
      sendJson(res, 500, { error: err.message ?? 'Internal error' });
    }
  }
}

async function handlePatchIssue(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  issueNumber: string
): Promise<void> {
  const query = parseQuery(req.url ?? '');
  const projectPath = query['path'] ?? '';
  if (!projectPath) {
    sendJson(res, 400, { error: 'path query parameter required' });
    return;
  }
  try {
    const raw = await readBody(req);
    const body = JSON.parse(raw) as {
      state?: string;
      addLabels?: string[];
      removeLabels?: string[];
      labels?: string[];
      title?: string;
    };
    const updated = await issuesService.updateIssue(projectPath, issueNumber, body);
    sendJson(res, 200, { ok: true, issue: updated });
  } catch (e) {
    const err = e as Error;
    sendJson(res, 500, { error: err.message ?? 'Internal error' });
  }
}

async function handleGetComments(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  issueNumber: string
): Promise<void> {
  const query = parseQuery(req.url ?? '');
  const projectPath = query['path'] ?? '';
  if (!projectPath) {
    sendJson(res, 400, { error: 'path query parameter required' });
    return;
  }
  try {
    const comments = await issuesService.fetchComments(projectPath, issueNumber);
    sendJson(res, 200, { comments });
  } catch (e) {
    const err = e as Error;
    sendJson(res, 500, { error: err.message ?? 'Internal error' });
  }
}

async function handlePostComment(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  issueNumber: string
): Promise<void> {
  const query = parseQuery(req.url ?? '');
  const projectPath = query['path'] ?? '';
  if (!projectPath) {
    sendJson(res, 400, { error: 'path query parameter required' });
    return;
  }
  try {
    const raw = await readBody(req);
    const body = JSON.parse(raw) as { body?: string };
    if (!body.body?.trim()) {
      sendJson(res, 400, { error: 'Comment body required' });
      return;
    }
    const comment = await issuesService.addComment(projectPath, issueNumber, body.body.trim());
    sendJson(res, 200, { ok: true, comment });
  } catch (e) {
    const err = e as Error;
    sendJson(res, 500, { error: err.message ?? 'Internal error' });
  }
}

async function handleGetConfig(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  const query = parseQuery(req.url ?? '');
  const projectPath = query['path'] ?? '';
  if (!projectPath) {
    sendJson(res, 400, { error: 'path query parameter required' });
    return;
  }
  try {
    const config = await configService.readConfig(projectPath);
    if (!config) {
      sendJson(res, 200, { configured: false });
    } else {
      sendJson(res, 200, {
        configured: true,
        enabled: config.enabled,
        owner: config.owner,
        repo: config.repo,
        hasToken: Boolean(config.token),
      });
    }
  } catch (e) {
    const err = e as Error;
    sendJson(res, 500, { error: err.message ?? 'Internal error' });
  }
}

// ---- Server ----
const server = http.createServer(async (req, res) => {
  const method = req.method ?? 'GET';
  const rawUrl = req.url ?? '/';
  let pathname: string;
  try {
    pathname = new URL(rawUrl, 'http://localhost').pathname;
  } catch {
    pathname = rawUrl.split('?')[0] ?? '/';
  }

  // CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  try {
    // GET /issues
    if (method === 'GET' && pathname === '/issues') {
      await handleGetIssues(req, res);
      return;
    }

    // GET /config
    if (method === 'GET' && pathname === '/config') {
      await handleGetConfig(req, res);
      return;
    }

    // PATCH /issues/:number
    const patchMatch = method === 'PATCH' && pathname.match(/^\/issues\/(\d+)$/);
    if (patchMatch && patchMatch[1]) {
      await handlePatchIssue(req, res, patchMatch[1]);
      return;
    }

    // GET /issues/:number/comments
    const getCommentsMatch = method === 'GET' && pathname.match(/^\/issues\/(\d+)\/comments$/);
    if (getCommentsMatch && getCommentsMatch[1]) {
      await handleGetComments(req, res, getCommentsMatch[1]);
      return;
    }

    // POST /issues/:number/comments
    const postCommentMatch = method === 'POST' && pathname.match(/^\/issues\/(\d+)\/comments$/);
    if (postCommentMatch && postCommentMatch[1]) {
      await handlePostComment(req, res, postCommentMatch[1]);
      return;
    }

    // PUT /config — save settings from UI
    if (method === 'PUT' && pathname === '/config') {
      const query = parseQuery(req.url ?? '');
      const projectPath = query['path'] ?? '';
      if (!projectPath) { sendJson(res, 400, { error: 'path query parameter required' }); return; }
      try {
        const raw = await readBody(req);
        const body = JSON.parse(raw) as { token?: string; owner?: string; repo?: string; enabled?: boolean };
        if (!body.token?.trim() || !body.owner?.trim() || !body.repo?.trim()) {
          sendJson(res, 400, { error: 'token, owner, and repo are required' });
          return;
        }
        const config = { token: body.token.trim(), owner: body.owner.trim(), repo: body.repo.trim(), enabled: body.enabled !== false };
        await configService.writeConfig(projectPath, config);
        sendJson(res, 200, { ok: true });
      } catch (e) {
        sendJson(res, 500, { error: (e as Error).message ?? 'Internal error' });
      }
      return;
    }

    // Health check
    if (method === 'GET' && pathname === '/health') {
      sendJson(res, 200, { ok: true, plugin: 'claude-github-issue' });
      return;
    }

    sendJson(res, 404, { error: 'Not found' });
  } catch (e) {
    const err = e as Error;
    console.error('[claude-github-issue] Unhandled error:', err.message);
    sendJson(res, 500, { error: 'Internal server error' });
  }
});

server.listen(0, '127.0.0.1', () => {
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  // Signal to plugin host that we're ready
  process.stdout.write(JSON.stringify({ type: 'ready', port }) + '\n');
});

server.on('error', (err) => {
  console.error('[claude-github-issue] Server error:', err.message);
  process.exit(1);
});
