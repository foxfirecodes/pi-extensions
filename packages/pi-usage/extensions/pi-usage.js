import { createReadStream } from "node:fs";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, extname, join, relative, resolve } from "node:path";
import readline from "node:readline";

const COMMAND_NAME = "usage";
const CACHE_VERSION = 2;
const CACHE_VARIANT_ALL = "all";

function uniqueValues(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

export function defaultSessionRoots() {
  return uniqueValues([
    process.env.PI_SESSION_DIR,
    process.env.PI_CODING_AGENT_DIR
      ? join(process.env.PI_CODING_AGENT_DIR, "sessions")
      : undefined,
    join(homedir(), ".pi", "agent", "sessions"),
    join(homedir(), ".pi", "sessions"),
  ]);
}

export function defaultSessionRoot() {
  return defaultSessionRoots()[0];
}

function defaultUsageCacheFile() {
  return join(homedir(), ".pi", "usage-cache.json");
}

function usageCacheFile() {
  return (
    normalizePath(process.env.PI_USAGE_CACHE_FILE) ?? defaultUsageCacheFile()
  );
}

function normalizePath(value) {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const expanded = value.startsWith("~")
    ? join(homedir(), value.slice(1))
    : value;
  return resolve(expanded);
}

function pathsOverlap(a, b) {
  const first = normalizePath(a);
  const second = normalizePath(b);
  if (!first || !second) return false;
  if (first === second) return true;

  const firstToSecond = relative(first, second);
  if (firstToSecond && !firstToSecond.startsWith("..") && firstToSecond !== ".")
    return true;

  const secondToFirst = relative(second, first);
  return Boolean(
    secondToFirst && !secondToFirst.startsWith("..") && secondToFirst !== ".",
  );
}

function sessionProjectPaths(entry) {
  const candidates = [
    entry.cwd,
    entry.workdir,
    entry.workingDirectory,
    entry.project,
    entry.projectPath,
    entry.projectRoot,
    entry.workspace,
    entry.workspacePath,
    entry.workspaceRoot,
    entry.metadata?.cwd,
    entry.metadata?.workdir,
    entry.metadata?.workingDirectory,
    entry.metadata?.project,
    entry.metadata?.projectPath,
    entry.metadata?.projectRoot,
    entry.metadata?.workspace,
    entry.metadata?.workspacePath,
    entry.metadata?.workspaceRoot,
  ];

  return candidates.filter((candidate) => typeof candidate === "string");
}

function sessionMatchesProject(entry, projectPath) {
  if (!projectPath) return true;
  return sessionProjectPaths(entry).some((candidate) =>
    pathsOverlap(projectPath, candidate),
  );
}

export function createUsageSummary() {
  return {
    turns: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    totalTokens: 0,
    costInput: 0,
    costOutput: 0,
    costCacheRead: 0,
    costCacheWrite: 0,
    costTotal: 0,
    sessions: 0,
    files: 0,
    errors: 0,
    projectPaths: new Set(),
    models: new Map(),
  };
}

function summaryCachePayload(summary) {
  return {
    turns: summary.turns,
    inputTokens: summary.inputTokens,
    outputTokens: summary.outputTokens,
    cacheReadTokens: summary.cacheReadTokens,
    cacheWriteTokens: summary.cacheWriteTokens,
    totalTokens: summary.totalTokens,
    costInput: summary.costInput,
    costOutput: summary.costOutput,
    costCacheRead: summary.costCacheRead,
    costCacheWrite: summary.costCacheWrite,
    costTotal: summary.costTotal,
    sessions: summary.sessions,
    files: summary.files,
    errors: summary.errors,
    projectPaths: Array.from(summary.projectPaths ?? []),
    models: Array.from(summary.models.values()),
  };
}

function summaryFromCachePayload(payload) {
  const summary = createUsageSummary();
  if (!payload || typeof payload !== "object") return summary;

  summary.turns = payload.turns ?? 0;
  summary.inputTokens = payload.inputTokens ?? 0;
  summary.outputTokens = payload.outputTokens ?? 0;
  summary.cacheReadTokens = payload.cacheReadTokens ?? 0;
  summary.cacheWriteTokens = payload.cacheWriteTokens ?? 0;
  summary.totalTokens = payload.totalTokens ?? 0;
  summary.costInput = payload.costInput ?? 0;
  summary.costOutput = payload.costOutput ?? 0;
  summary.costCacheRead = payload.costCacheRead ?? 0;
  summary.costCacheWrite = payload.costCacheWrite ?? 0;
  summary.costTotal = payload.costTotal ?? 0;
  summary.sessions = payload.sessions ?? 0;
  summary.files = payload.files ?? 0;
  summary.errors = payload.errors ?? 0;
  summary.projectPaths = new Set(payload.projectPaths ?? []);

  for (const row of payload.models ?? []) {
    if (!row?.provider || !row?.model) continue;
    summary.models.set(`${row.provider}::${row.model}`, row);
  }

  return summary;
}

function addNumbers(target, source) {
  target.turns += source.turns;
  target.inputTokens += source.inputTokens;
  target.outputTokens += source.outputTokens;
  target.cacheReadTokens += source.cacheReadTokens;
  target.cacheWriteTokens += source.cacheWriteTokens;
  target.totalTokens += source.totalTokens;
  target.costInput += source.costInput;
  target.costOutput += source.costOutput;
  target.costCacheRead += source.costCacheRead;
  target.costCacheWrite += source.costCacheWrite;
  target.costTotal += source.costTotal;
}

function addModelRows(target, source) {
  for (const row of source.models.values()) {
    const existing = target.models.get(`${row.provider}::${row.model}`) ?? {
      provider: row.provider,
      model: row.model,
      turns: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      totalTokens: 0,
      costInput: 0,
      costOutput: 0,
      costCacheRead: 0,
      costCacheWrite: 0,
      costTotal: 0,
    };
    addNumbers(existing, row);
    target.models.set(`${row.provider}::${row.model}`, existing);
  }
}

function addFileSummary(target, fileSummary) {
  target.files++;
  addNumbers(target, fileSummary);
  target.sessions += fileSummary.sessions;
  target.errors += fileSummary.errors;
  addModelRows(target, fileSummary);
}

async function loadUsageCache() {
  try {
    const content = await readFile(usageCacheFile(), "utf-8");
    const cache = JSON.parse(content);
    if (cache?.version === CACHE_VERSION && cache.files) return cache;
  } catch {
    // Cache misses and corrupt cache files should never block usage reports.
  }

  return {
    version: CACHE_VERSION,
    lastCheckedAt: undefined,
    files: {},
  };
}

async function saveUsageCache(cache) {
  const cacheFile = usageCacheFile();
  try {
    await mkdir(dirname(cacheFile), { recursive: true });
    await writeFile(cacheFile, `${JSON.stringify(cache, null, 2)}\n`, "utf-8");
  } catch {
    // Reports are still useful even when the cache cannot be persisted.
  }
}

function cacheVariant(options) {
  if (!options.projectPath) return CACHE_VARIANT_ALL;
  return `project:${normalizePath(options.projectPath) ?? options.projectPath}`;
}

function cacheHit(entry, fileStat, variant) {
  if (!entry) return undefined;
  if (entry.size !== fileStat.size || entry.mtimeMs !== fileStat.mtimeMs) {
    return undefined;
  }

  const payload = entry.summaries?.[variant];
  if (payload) return summaryFromCachePayload(payload);

  const allPayload = entry.summaries?.[CACHE_VARIANT_ALL];
  if (!variant.startsWith("project:") || !allPayload) return undefined;

  const projectPath = variant.slice("project:".length);
  const matchesProject = (allPayload.projectPaths ?? []).some((candidate) =>
    pathsOverlap(projectPath, candidate),
  );
  return matchesProject
    ? summaryFromCachePayload(allPayload)
    : createUsageSummary();
}

async function scanSessionFileCached(filePath, options, cache, checkedAt) {
  let fileStat;
  try {
    fileStat = await stat(filePath);
  } catch {
    return scanSessionFile(filePath, options);
  }

  const variant = cacheVariant(options);
  const cachedSummary = cacheHit(cache.files[filePath], fileStat, variant);
  if (cachedSummary) {
    cache.files[filePath].checkedAt = checkedAt;
    return cachedSummary;
  }

  const summary = await scanSessionFile(filePath, options);
  const existingEntry = cache.files[filePath];
  const entry =
    existingEntry?.size === fileStat.size &&
    existingEntry?.mtimeMs === fileStat.mtimeMs
      ? existingEntry
      : { summaries: {} };
  entry.size = fileStat.size;
  entry.mtimeMs = fileStat.mtimeMs;
  entry.checkedAt = checkedAt;
  entry.summaries = entry.summaries ?? {};
  entry.summaries[variant] = summaryCachePayload(summary);
  cache.files[filePath] = entry;
  return summary;
}

function usageToStats(usage) {
  const input = usage.input ?? 0;
  const output = usage.output ?? 0;
  const cacheRead = usage.cacheRead ?? 0;
  const cacheWrite = usage.cacheWrite ?? 0;
  const cost = usage.cost ?? {};

  return {
    turns: 1,
    inputTokens: input,
    outputTokens: output,
    cacheReadTokens: cacheRead,
    cacheWriteTokens: cacheWrite,
    totalTokens: usage.totalTokens ?? input + output + cacheRead + cacheWrite,
    costInput: cost.input ?? 0,
    costOutput: cost.output ?? 0,
    costCacheRead: cost.cacheRead ?? 0,
    costCacheWrite: cost.cacheWrite ?? 0,
    costTotal: cost.total ?? 0,
  };
}

export function addAssistantUsage(
  summary,
  message,
  fallbackProvider = "unknown",
) {
  if (message?.role !== "assistant" || !message.usage) return false;

  const provider = message.provider ?? fallbackProvider;
  const model = message.model ?? "unknown";
  const key = `${provider}::${model}`;
  const stats = usageToStats(message.usage);

  addNumbers(summary, stats);

  const existing = summary.models.get(key) ?? {
    provider,
    model,
    turns: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    totalTokens: 0,
    costInput: 0,
    costOutput: 0,
    costCacheRead: 0,
    costCacheWrite: 0,
    costTotal: 0,
  };

  addNumbers(existing, stats);
  summary.models.set(key, existing);
  return true;
}

export function summarizeEntries(entries) {
  const summary = createUsageSummary();

  for (const entry of entries) {
    if (entry?.type === "message") {
      addAssistantUsage(summary, entry.message);
    }
  }

  return summary;
}

export async function collectSessionFiles(path) {
  let pathStat;
  try {
    pathStat = await stat(path);
  } catch {
    return [];
  }

  if (pathStat.isFile()) {
    return extname(path) === ".jsonl" ? [path] : [];
  }

  if (!pathStat.isDirectory()) return [];

  const files = [];
  let entries;
  try {
    entries = await readdir(path, { withFileTypes: true });
  } catch {
    return files;
  }

  for (const entry of entries) {
    const childPath = join(path, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectSessionFiles(childPath)));
    } else if (entry.isFile() && extname(entry.name) === ".jsonl") {
      files.push(childPath);
    }
  }

  return files;
}

export async function scanSessionFile(filePath, options = {}) {
  const summary = createUsageSummary();
  summary.files = 1;

  let reader;
  try {
    reader = readline.createInterface({
      input: createReadStream(filePath),
      crlfDelay: Infinity,
    });
  } catch {
    summary.errors++;
    return summary;
  }

  let countedSession = false;
  let fallbackProvider = "unknown";
  let includeFile = options.projectPath ? false : true;

  try {
    for await (const line of reader) {
      if (!line.trim()) continue;

      let entry;
      try {
        entry = JSON.parse(line);
      } catch {
        if (includeFile) summary.errors++;
        continue;
      }

      if (entry.type === "session") {
        for (const projectPath of sessionProjectPaths(entry)) {
          summary.projectPaths.add(projectPath);
        }

        includeFile ||= sessionMatchesProject(entry, options.projectPath);
        if (!includeFile) continue;

        if (!countedSession) {
          summary.sessions++;
          countedSession = true;
        }
        fallbackProvider = entry.provider ?? fallbackProvider;
        continue;
      }

      if (includeFile && entry.type === "message") {
        addAssistantUsage(summary, entry.message, fallbackProvider);
      }
    }
  } catch {
    summary.errors++;
  } finally {
    reader.close();
  }

  return summary;
}

export async function scanSessionPath(path, options = {}) {
  const summary = createUsageSummary();
  const files = await collectSessionFiles(path);
  const cache = await loadUsageCache();
  const checkedAt = new Date().toISOString();

  for (const file of files) {
    const fileSummary = await scanSessionFileCached(
      file,
      options,
      cache,
      checkedAt,
    );
    if (options.projectPath && !fileSummary.sessions) continue;
    addFileSummary(summary, fileSummary);
  }

  cache.lastCheckedAt = checkedAt;
  await saveUsageCache(cache);
  return summary;
}

export async function scanSessionPaths(paths, options = {}) {
  const summary = createUsageSummary();
  const seenFiles = new Set();
  const cache = await loadUsageCache();
  const checkedAt = new Date().toISOString();

  for (const path of paths) {
    const files = await collectSessionFiles(path);
    for (const file of files) {
      if (seenFiles.has(file)) continue;
      seenFiles.add(file);

      const fileSummary = await scanSessionFileCached(
        file,
        options,
        cache,
        checkedAt,
      );
      if (options.projectPath && !fileSummary.sessions) continue;
      addFileSummary(summary, fileSummary);
    }
  }

  cache.lastCheckedAt = checkedAt;
  await saveUsageCache(cache);
  return summary;
}

export function serializableSummary(summary) {
  return {
    turns: summary.turns,
    inputTokens: summary.inputTokens,
    outputTokens: summary.outputTokens,
    cacheReadTokens: summary.cacheReadTokens,
    cacheWriteTokens: summary.cacheWriteTokens,
    totalTokens: summary.totalTokens,
    cost: {
      input: summary.costInput,
      output: summary.costOutput,
      cacheRead: summary.costCacheRead,
      cacheWrite: summary.costCacheWrite,
      total: summary.costTotal,
    },
    sessions: summary.sessions,
    files: summary.files,
    errors: summary.errors,
    models: Array.from(summary.models.values()).sort(
      (a, b) => b.totalTokens - a.totalTokens,
    ),
  };
}

function formatInteger(value) {
  return Math.round(value).toLocaleString("en-US");
}

function formatCost(value) {
  return `$${value.toFixed(4)}`;
}

export function formatSummary(
  summary,
  { title = "Pi usage", includeScan = false } = {},
) {
  const rows = Array.from(summary.models.values()).sort(
    (a, b) => b.totalTokens - a.totalTokens,
  );
  const lines = [
    `${title}`,
    `Turns: ${formatInteger(summary.turns)}`,
    `Tokens: ${formatInteger(summary.totalTokens)} total (${formatInteger(summary.inputTokens)} input, ${formatInteger(summary.outputTokens)} output, ${formatInteger(summary.cacheReadTokens)} cache read, ${formatInteger(summary.cacheWriteTokens)} cache write)`,
    `Cost: ${formatCost(summary.costTotal)}`,
  ];

  if (includeScan || summary.sessions || summary.files || summary.errors) {
    lines.push(
      `Scanned: ${formatInteger(summary.sessions)} sessions, ${formatInteger(summary.files)} files, ${formatInteger(summary.errors)} errors`,
    );
  }

  if (rows.length > 0) {
    lines.push("", "By model:");
    for (const row of rows) {
      lines.push(
        `- ${row.provider}/${row.model}: ${formatInteger(row.totalTokens)} tokens, ${formatCost(row.costTotal)}, ${formatInteger(row.turns)} turns`,
      );
    }
  }

  if (rows.length === 0) {
    lines.push("", "No assistant usage metadata found.");
  }

  return lines.join("\n");
}

function splitArgs(args) {
  if (Array.isArray(args)) return args;
  if (args === undefined || args === null) return [];
  if (typeof args !== "string") return [];

  const tokens = [];
  let current = "";
  let quote;
  let escaping = false;

  for (const char of args.trim()) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }

    if (char === "\\") {
      escaping = true;
      continue;
    }

    if (quote) {
      if (char === quote) {
        quote = undefined;
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (escaping) current += "\\";
  if (current) tokens.push(current);
  return tokens;
}

function parseArgs(args) {
  const tokens = splitArgs(args);
  const parsed = {
    all: false,
    backfill: false,
    json: false,
    path: undefined,
    project: false,
  };

  for (let index = 0; index < tokens.length; index++) {
    const arg = tokens[index];
    if (arg === "--all" || arg === "-a") {
      parsed.all = true;
      continue;
    }
    if (arg === "--backfill") {
      parsed.all = true;
      parsed.backfill = true;
      continue;
    }
    if (arg === "--json") {
      parsed.json = true;
      continue;
    }
    if (arg === "--project") {
      parsed.all = true;
      parsed.project = true;
      continue;
    }
    if (arg === "--path" || arg === "-p") {
      parsed.path = tokens[index + 1];
      index++;
      continue;
    }
    if (arg.startsWith("--path=")) {
      parsed.path = arg.slice("--path=".length);
    }
  }

  if (parsed.path) parsed.all = true;
  return parsed;
}

function writeReport(report, ctx) {
  if (ctx.hasUI) {
    ctx.ui.notify(report, "info");
    return;
  }

  console.log(report);
}

async function handleUsageCommand(args, ctx) {
  const parsed = parseArgs(args);
  const projectPath = parsed.project ? (ctx.cwd ?? process.cwd()) : undefined;
  const summary = parsed.all
    ? parsed.path
      ? await scanSessionPath(parsed.path, { projectPath })
      : await scanSessionPaths(defaultSessionRoots(), { projectPath })
    : summarizeEntries(ctx.sessionManager.getBranch());
  const title = parsed.all
    ? parsed.project
      ? "Pi project usage"
      : parsed.backfill
        ? "Pi backfilled lifetime usage"
        : "Pi lifetime usage"
    : "Pi current session usage";
  const report = parsed.json
    ? JSON.stringify(serializableSummary(summary), null, 2)
    : formatSummary(summary, { title, includeScan: parsed.all });

  writeReport(report, ctx);
}

export default function piUsage(pi) {
  pi.registerCommand(COMMAND_NAME, {
    description:
      "Report token usage and cost. Args: [--all] [--backfill] [--project] [--json] [--path file-or-dir]",
    handler: handleUsageCommand,
  });
}
