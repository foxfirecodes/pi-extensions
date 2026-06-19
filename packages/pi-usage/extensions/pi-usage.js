import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { extname, join } from "node:path";
import readline from "node:readline";

const COMMAND_NAME = "usage";

export function defaultSessionRoot() {
  return join(
    process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent"),
    "sessions",
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
    models: new Map(),
  };
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

export async function scanSessionFile(filePath) {
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

  try {
    for await (const line of reader) {
      if (!line.trim()) continue;

      let entry;
      try {
        entry = JSON.parse(line);
      } catch {
        summary.errors++;
        continue;
      }

      if (entry.type === "session") {
        if (!countedSession) {
          summary.sessions++;
          countedSession = true;
        }
        fallbackProvider = entry.provider ?? fallbackProvider;
        continue;
      }

      if (entry.type === "message") {
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

export async function scanSessionPath(path) {
  const summary = createUsageSummary();
  const files = await collectSessionFiles(path);
  summary.files = files.length;

  for (const file of files) {
    const fileSummary = await scanSessionFile(file);
    addNumbers(summary, fileSummary);
    summary.sessions += fileSummary.sessions;
    summary.errors += fileSummary.errors;

    for (const row of fileSummary.models.values()) {
      const existing = summary.models.get(`${row.provider}::${row.model}`) ?? {
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
      summary.models.set(`${row.provider}::${row.model}`, existing);
    }
  }

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

export function formatSummary(summary, { title = "Pi usage" } = {}) {
  const rows = Array.from(summary.models.values()).sort(
    (a, b) => b.totalTokens - a.totalTokens,
  );
  const lines = [
    `${title}`,
    `Turns: ${formatInteger(summary.turns)}`,
    `Tokens: ${formatInteger(summary.totalTokens)} total (${formatInteger(summary.inputTokens)} input, ${formatInteger(summary.outputTokens)} output, ${formatInteger(summary.cacheReadTokens)} cache read, ${formatInteger(summary.cacheWriteTokens)} cache write)`,
    `Cost: ${formatCost(summary.costTotal)}`,
  ];

  if (summary.sessions || summary.files || summary.errors) {
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

function parseArgs(args) {
  const parsed = {
    all: false,
    json: false,
    path: undefined,
  };

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--all" || arg === "-a") {
      parsed.all = true;
      continue;
    }
    if (arg === "--json") {
      parsed.json = true;
      continue;
    }
    if (arg === "--path" || arg === "-p") {
      parsed.path = args[index + 1];
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
  const summary = parsed.all
    ? await scanSessionPath(parsed.path ?? defaultSessionRoot())
    : summarizeEntries(ctx.sessionManager.getBranch());
  const title = parsed.all ? "Pi lifetime usage" : "Pi current session usage";
  const report = parsed.json
    ? JSON.stringify(serializableSummary(summary), null, 2)
    : formatSummary(summary, { title });

  writeReport(report, ctx);
}

export default function piUsage(pi) {
  pi.registerCommand(COMMAND_NAME, {
    description:
      "Report token usage and cost. Args: [--all] [--json] [--path file-or-dir]",
    handler: handleUsageCommand,
  });
}
