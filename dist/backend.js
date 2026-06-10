"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// src/backend/server.ts
var import_http = __toESM(require("http"));
var import_path2 = __toESM(require("path"));
var import_fs2 = __toESM(require("fs"));
var import_url = require("url");

// src/backend/github.service.ts
var GITHUB_API = "https://api.github.com";
function makeHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json"
  };
}
async function githubFetch(token, method, urlPath, body) {
  const opts = { method, headers: makeHeaders(token) };
  if (body !== void 0) opts.body = JSON.stringify(body);
  const res = await fetch(`${GITHUB_API}${urlPath}`, opts);
  if (res.status === 204) return null;
  const json = await res.json();
  if (!res.ok) {
    const msg = json?.message ?? JSON.stringify(json);
    throw new Error(`GitHub ${method} ${urlPath} \u2192 ${res.status}: ${msg}`);
  }
  return json;
}
async function listIssues(token, owner, repo, state = "all") {
  const all = [];
  let page = 1;
  while (true) {
    const batch = await githubFetch(
      token,
      "GET",
      `/repos/${owner}/${repo}/issues?state=${state}&per_page=100&page=${page}`
    );
    const issues = batch.filter((i) => !i.pull_request);
    all.push(...issues);
    if (batch.length < 100) break;
    page++;
    if (page > 20) break;
  }
  return all;
}
async function listIssueComments(token, owner, repo, issueNumber) {
  return githubFetch(
    token,
    "GET",
    `/repos/${owner}/${repo}/issues/${issueNumber}/comments?per_page=100`
  );
}
async function patchIssue(token, owner, repo, number, patch) {
  return githubFetch(token, "PATCH", `/repos/${owner}/${repo}/issues/${number}`, patch);
}
async function getIssue(token, owner, repo, number) {
  return githubFetch(token, "GET", `/repos/${owner}/${repo}/issues/${number}`);
}
async function createComment(token, owner, repo, issueNumber, body) {
  return githubFetch(
    token,
    "POST",
    `/repos/${owner}/${repo}/issues/${issueNumber}/comments`,
    { body }
  );
}

// src/backend/config.service.ts
var import_path = __toESM(require("path"));
var import_fs = require("fs");
var SYNC_FILE = ".GitHubBoard/github-sync.json";
async function readConfig(projectPath) {
  if (!projectPath) return null;
  const filePath = import_path.default.join(projectPath, SYNC_FILE);
  try {
    const content = await import_fs.promises.readFile(filePath, "utf8");
    const parsed = JSON.parse(content);
    if (!parsed.token || !parsed.owner || !parsed.repo) return null;
    return {
      token: parsed.token,
      owner: parsed.owner,
      repo: parsed.repo,
      enabled: parsed.enabled !== false
    };
  } catch {
    return null;
  }
}
async function writeConfig(projectPath, config) {
  if (!projectPath) throw new Error("projectPath required");
  const dir = import_path.default.join(projectPath, ".GitHubBoard");
  await import_fs.promises.mkdir(dir, { recursive: true });
  const filePath = import_path.default.join(projectPath, SYNC_FILE);
  await import_fs.promises.writeFile(filePath, JSON.stringify(config, null, 2), "utf8");
}

// src/backend/cache.ts
var Cache = class {
  store = /* @__PURE__ */ new Map();
  get(key) {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }
  set(key, value, ttlMs) {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }
  delete(key) {
    this.store.delete(key);
  }
  deletePrefix(prefix) {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }
  clear() {
    this.store.clear();
  }
};
var globalCache = new Cache();
function cacheGet(key) {
  return globalCache.get(key);
}
function cacheSet(key, value, ttlMs) {
  globalCache.set(key, value, ttlMs);
}
function cacheDeletePrefix(prefix) {
  globalCache.deletePrefix(prefix);
}

// src/backend/issues.service.ts
var ISSUES_TTL = 6e4;
var COMMENTS_TTL = 3e4;
var COLUMNS = [
  { id: "todo", name: "To Do", title: "To Do", state: "open", labels: [] },
  { id: "in-progress", name: "In Progress", title: "In Progress", state: "open", labels: ["in-progress"] },
  { id: "review", name: "In Review", title: "In Review", state: "open", labels: ["review"] },
  { id: "blocked", name: "Blocked", title: "Blocked", state: "open", labels: ["blocked"] },
  { id: "done", name: "Done", title: "Done", state: "closed", labels: [] }
];
function buildColumns() {
  return COLUMNS.map((c) => ({ id: c.id, name: c.name, labels: c.labels }));
}
function issueToColumnId(issue) {
  if (issue.state === "closed") return "done";
  const labelNames = new Set(issue.labels.map((l) => l.name));
  for (const col of COLUMNS) {
    if (col.labels.length > 0 && col.labels.some((l) => labelNames.has(l))) {
      return col.id;
    }
  }
  return "todo";
}
function categorizeIssues(issues) {
  return issues.map((issue) => ({ ...issue, columnId: issueToColumnId(issue) }));
}
async function fetchIssues(projectPath) {
  const config = await readConfig(projectPath);
  if (!config?.token || !config?.owner || !config?.repo) {
    const err = new Error("GitHub not configured for this project");
    err.notConfigured = true;
    throw err;
  }
  const cacheKey = `issues:${config.owner}/${config.repo}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;
  const raw = await listIssues(config.token, config.owner, config.repo, "all");
  const issues = categorizeIssues(raw);
  const result = { issues, columns: buildColumns(), owner: config.owner, repo: config.repo };
  cacheSet(cacheKey, result, ISSUES_TTL);
  return result;
}
async function fetchComments(projectPath, issueNumber) {
  const config = await readConfig(projectPath);
  if (!config?.token || !config?.owner || !config?.repo) return [];
  const cacheKey = `comments:${config.owner}/${config.repo}:${issueNumber}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;
  const comments = await listIssueComments(config.token, config.owner, config.repo, issueNumber);
  cacheSet(cacheKey, comments, COMMENTS_TTL);
  return comments;
}
async function addComment(projectPath, issueNumber, body) {
  const config = await readConfig(projectPath);
  if (!config?.token || !config?.owner || !config?.repo) throw new Error("Not configured");
  const comment = await createComment(config.token, config.owner, config.repo, issueNumber, body);
  cacheDeletePrefix(`comments:${config.owner}/${config.repo}:${issueNumber}`);
  return comment;
}
async function updateIssue(projectPath, issueNumber, { state, addLabels, removeLabels, labels, title }) {
  const config = await readConfig(projectPath);
  if (!config?.token || !config?.owner || !config?.repo) throw new Error("Not configured");
  const patch = {};
  if (state !== void 0) patch.state = state;
  if (title !== void 0) patch.title = title;
  if (labels !== void 0) {
    patch.labels = labels;
  } else if (addLabels?.length || removeLabels?.length) {
    const current = await getIssue(config.token, config.owner, config.repo, issueNumber);
    const currentLabels = (current.labels || []).map((l) => l.name);
    const filtered = currentLabels.filter((l) => !(removeLabels ?? []).includes(l));
    patch.labels = [.../* @__PURE__ */ new Set([...filtered, ...addLabels ?? []])];
  }
  const updated = await patchIssue(config.token, config.owner, config.repo, issueNumber, patch);
  cacheDeletePrefix(`issues:${config.owner}/${config.repo}`);
  return updated;
}

// src/backend/server.ts
function installSkill() {
  try {
    const homeDir = process.env.HOME || process.env.USERPROFILE || "";
    if (!homeDir) return;
    const skillDir = import_path2.default.join(homeDir, ".claude", "skills", "github-task");
    const skillFile = import_path2.default.join(skillDir, "SKILL.md");
    if (!import_fs2.default.existsSync(skillFile)) {
      import_fs2.default.mkdirSync(skillDir, { recursive: true });
      const sourceSkill = import_path2.default.join(__dirname, "..", "skill", "SKILL.md");
      if (import_fs2.default.existsSync(sourceSkill)) {
        import_fs2.default.copyFileSync(sourceSkill, skillFile);
        console.log("[claude-github-issue] Installed /github-task skill to", skillFile);
      } else {
        console.log("[claude-github-issue] Skill source not found at", sourceSkill, "\u2014 skipping auto-install");
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[claude-github-issue] Could not install skill:", msg);
  }
}
installSkill();
function parseQuery(rawUrl) {
  try {
    const u = new import_url.URL(rawUrl, "http://localhost");
    const result = {};
    u.searchParams.forEach((v, k) => {
      result[k] = v;
    });
    return result;
  } catch {
    return {};
  }
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}
function sendJson(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(json),
    "Access-Control-Allow-Origin": "*"
  });
  res.end(json);
}
async function handleGetIssues(req, res) {
  const query = parseQuery(req.url ?? "");
  const projectPath = query["path"] ?? "";
  if (!projectPath) {
    sendJson(res, 400, { error: "path query parameter required" });
    return;
  }
  try {
    const result = await fetchIssues(projectPath);
    sendJson(res, 200, result);
  } catch (e) {
    const err = e;
    if (err.notConfigured) {
      sendJson(res, 200, { notConfigured: true, error: err.message });
    } else {
      sendJson(res, 500, { error: err.message ?? "Internal error" });
    }
  }
}
async function handlePatchIssue(req, res, issueNumber) {
  const query = parseQuery(req.url ?? "");
  const projectPath = query["path"] ?? "";
  if (!projectPath) {
    sendJson(res, 400, { error: "path query parameter required" });
    return;
  }
  try {
    const raw = await readBody(req);
    const body = JSON.parse(raw);
    const updated = await updateIssue(projectPath, issueNumber, body);
    sendJson(res, 200, { ok: true, issue: updated });
  } catch (e) {
    const err = e;
    sendJson(res, 500, { error: err.message ?? "Internal error" });
  }
}
async function handleGetComments(req, res, issueNumber) {
  const query = parseQuery(req.url ?? "");
  const projectPath = query["path"] ?? "";
  if (!projectPath) {
    sendJson(res, 400, { error: "path query parameter required" });
    return;
  }
  try {
    const comments = await fetchComments(projectPath, issueNumber);
    sendJson(res, 200, { comments });
  } catch (e) {
    const err = e;
    sendJson(res, 500, { error: err.message ?? "Internal error" });
  }
}
async function handlePostComment(req, res, issueNumber) {
  const query = parseQuery(req.url ?? "");
  const projectPath = query["path"] ?? "";
  if (!projectPath) {
    sendJson(res, 400, { error: "path query parameter required" });
    return;
  }
  try {
    const raw = await readBody(req);
    const body = JSON.parse(raw);
    if (!body.body?.trim()) {
      sendJson(res, 400, { error: "Comment body required" });
      return;
    }
    const comment = await addComment(projectPath, issueNumber, body.body.trim());
    sendJson(res, 200, { ok: true, comment });
  } catch (e) {
    const err = e;
    sendJson(res, 500, { error: err.message ?? "Internal error" });
  }
}
async function handleGetConfig(req, res) {
  const query = parseQuery(req.url ?? "");
  const projectPath = query["path"] ?? "";
  if (!projectPath) {
    sendJson(res, 400, { error: "path query parameter required" });
    return;
  }
  try {
    const config = await readConfig(projectPath);
    if (!config) {
      sendJson(res, 200, { configured: false });
    } else {
      sendJson(res, 200, {
        configured: true,
        enabled: config.enabled,
        owner: config.owner,
        repo: config.repo,
        hasToken: Boolean(config.token)
      });
    }
  } catch (e) {
    const err = e;
    sendJson(res, 500, { error: err.message ?? "Internal error" });
  }
}
var server = import_http.default.createServer(async (req, res) => {
  const method = req.method ?? "GET";
  const rawUrl = req.url ?? "/";
  let pathname;
  try {
    pathname = new import_url.URL(rawUrl, "http://localhost").pathname;
  } catch {
    pathname = rawUrl.split("?")[0] ?? "/";
  }
  if (method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    });
    res.end();
    return;
  }
  try {
    if (method === "GET" && pathname === "/issues") {
      await handleGetIssues(req, res);
      return;
    }
    if (method === "GET" && pathname === "/config") {
      await handleGetConfig(req, res);
      return;
    }
    const patchMatch = method === "PATCH" && pathname.match(/^\/issues\/(\d+)$/);
    if (patchMatch && patchMatch[1]) {
      await handlePatchIssue(req, res, patchMatch[1]);
      return;
    }
    const getCommentsMatch = method === "GET" && pathname.match(/^\/issues\/(\d+)\/comments$/);
    if (getCommentsMatch && getCommentsMatch[1]) {
      await handleGetComments(req, res, getCommentsMatch[1]);
      return;
    }
    const postCommentMatch = method === "POST" && pathname.match(/^\/issues\/(\d+)\/comments$/);
    if (postCommentMatch && postCommentMatch[1]) {
      await handlePostComment(req, res, postCommentMatch[1]);
      return;
    }
    if (method === "PUT" && pathname === "/config") {
      const query = parseQuery(req.url ?? "");
      const projectPath = query["path"] ?? "";
      if (!projectPath) {
        sendJson(res, 400, { error: "path query parameter required" });
        return;
      }
      try {
        const raw = await readBody(req);
        const body = JSON.parse(raw);
        if (!body.token?.trim() || !body.owner?.trim() || !body.repo?.trim()) {
          sendJson(res, 400, { error: "token, owner, and repo are required" });
          return;
        }
        const config = { token: body.token.trim(), owner: body.owner.trim(), repo: body.repo.trim(), enabled: body.enabled !== false };
        await writeConfig(projectPath, config);
        sendJson(res, 200, { ok: true });
      } catch (e) {
        sendJson(res, 500, { error: e.message ?? "Internal error" });
      }
      return;
    }
    if (method === "GET" && pathname === "/health") {
      sendJson(res, 200, { ok: true, plugin: "claude-github-issue" });
      return;
    }
    sendJson(res, 404, { error: "Not found" });
  } catch (e) {
    const err = e;
    console.error("[claude-github-issue] Unhandled error:", err.message);
    sendJson(res, 500, { error: "Internal server error" });
  }
});
server.listen(0, "127.0.0.1", () => {
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  process.stdout.write(JSON.stringify({ type: "ready", port }) + "\n");
});
server.on("error", (err) => {
  console.error("[claude-github-issue] Server error:", err.message);
  process.exit(1);
});
