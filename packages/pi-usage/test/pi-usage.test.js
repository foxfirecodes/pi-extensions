import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import piUsage, {
  addAssistantUsage,
  collectSessionFiles,
  createUsageSummary,
  defaultSessionRoots,
  formatSummary,
  scanSessionFile,
  scanSessionPath,
  scanSessionPaths,
  serializableSummary,
  summarizeEntries,
} from "../extensions/pi-usage.js";

function usage(input, output, totalCost, extra = {}) {
  return {
    input,
    output,
    cacheRead: extra.cacheRead ?? 0,
    cacheWrite: extra.cacheWrite ?? 0,
    totalTokens:
      extra.totalTokens ??
      input + output + (extra.cacheRead ?? 0) + (extra.cacheWrite ?? 0),
    cost: {
      input: extra.costInput ?? 0,
      output: extra.costOutput ?? 0,
      cacheRead: extra.costCacheRead ?? 0,
      cacheWrite: extra.costCacheWrite ?? 0,
      total: totalCost,
    },
  };
}

function assistant(model, provider, messageUsage) {
  return {
    role: "assistant",
    model,
    provider,
    usage: messageUsage,
    content: [],
    stopReason: "stop",
    timestamp: Date.now(),
  };
}

async function writeJsonl(filePath, entries) {
  await writeFile(
    filePath,
    `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`,
    "utf-8",
  );
}

async function createFixtureDir() {
  const dir = await mkdtemp(join(tmpdir(), "pi-usage-"));
  const nested = join(dir, "project");
  await mkdir(nested);

  await writeJsonl(join(dir, "one.jsonl"), [
    { type: "session", id: "one", provider: "anthropic" },
    { type: "message", message: { role: "user", content: "hello" } },
    {
      type: "message",
      message: assistant(
        "claude-sonnet-4-20250514",
        "anthropic",
        usage(100, 50, 0.0015),
      ),
    },
    { type: "message", message: { role: "assistant", content: [] } },
  ]);

  await writeFile(
    join(nested, "two.jsonl"),
    [
      JSON.stringify({ type: "session", id: "two" }),
      JSON.stringify({
        type: "message",
        message: assistant(
          "gpt-5",
          "openai",
          usage(200, 80, 0.004, { cacheRead: 20 }),
        ),
      }),
      "{not-json",
      JSON.stringify({
        type: "message",
        message: {
          role: "assistant",
          model: "fallback-model",
          usage: usage(10, 5, 0.0001),
        },
      }),
      "",
    ].join("\n"),
    "utf-8",
  );

  await writeJsonl(join(nested, "empty.jsonl"), [
    { type: "session", id: "two" },
  ]);

  await writeFile(join(dir, "notes.txt"), "ignore me", "utf-8");
  return dir;
}

test("adds assistant usage to totals and model buckets", () => {
  const summary = createUsageSummary();

  assert.equal(
    addAssistantUsage(
      summary,
      assistant(
        "claude-sonnet-4-20250514",
        "anthropic",
        usage(100, 50, 0.0015),
      ),
    ),
    true,
  );
  assert.equal(addAssistantUsage(summary, { role: "user" }), false);

  assert.equal(summary.turns, 1);
  assert.equal(summary.inputTokens, 100);
  assert.equal(summary.outputTokens, 50);
  assert.equal(summary.totalTokens, 150);
  assert.equal(summary.costTotal, 0.0015);
  assert.equal(summary.models.size, 1);
});

test("discovers Pi session roots", () => {
  const previousPiDir = process.env.PI_CODING_AGENT_DIR;
  const previousPiSessionDir = process.env.PI_SESSION_DIR;

  process.env.PI_CODING_AGENT_DIR = "/tmp/pi-agent";
  process.env.PI_SESSION_DIR = "/tmp/custom-sessions";

  try {
    assert.deepEqual(defaultSessionRoots().slice(0, 3), [
      "/tmp/custom-sessions",
      "/tmp/pi-agent/sessions",
      join(homedir(), ".pi", "agent", "sessions"),
    ]);
  } finally {
    if (previousPiDir === undefined) {
      delete process.env.PI_CODING_AGENT_DIR;
    } else {
      process.env.PI_CODING_AGENT_DIR = previousPiDir;
    }
    if (previousPiSessionDir === undefined) {
      delete process.env.PI_SESSION_DIR;
    } else {
      process.env.PI_SESSION_DIR = previousPiSessionDir;
    }
  }
});

test("summarizes current branch entries", () => {
  const summary = summarizeEntries([
    { type: "message", message: { role: "user", content: "hello" } },
    {
      type: "message",
      message: assistant(
        "claude-sonnet-4-20250514",
        "anthropic",
        usage(100, 50, 0.0015),
      ),
    },
    {
      type: "message",
      message: assistant(
        "claude-sonnet-4-20250514",
        "anthropic",
        usage(25, 10, 0.0005),
      ),
    },
  ]);

  assert.equal(summary.turns, 2);
  assert.equal(summary.inputTokens, 125);
  assert.equal(summary.outputTokens, 60);
  assert.equal(summary.totalTokens, 185);
  assert.equal(
    summary.models.get("anthropic::claude-sonnet-4-20250514").turns,
    2,
  );
});

test("collects and scans session JSONL files recursively", async () => {
  const dir = await createFixtureDir();

  const files = await collectSessionFiles(dir);
  assert.equal(files.length, 3);
  assert.ok(files.every((file) => file.endsWith(".jsonl")));

  const summary = await scanSessionPath(dir);

  assert.equal(summary.files, 3);
  assert.equal(summary.sessions, 3);
  assert.equal(summary.errors, 1);
  assert.equal(summary.turns, 3);
  assert.equal(summary.inputTokens, 310);
  assert.equal(summary.outputTokens, 135);
  assert.equal(summary.cacheReadTokens, 20);
  assert.equal(summary.totalTokens, 465);
  assert.equal(summary.models.size, 3);
});

test("scans multiple default-style roots without double-counting files", async () => {
  const dir = await createFixtureDir();
  const summary = await scanSessionPaths([dir, dir]);

  assert.equal(summary.files, 3);
  assert.equal(summary.sessions, 3);
  assert.equal(summary.turns, 3);
  assert.equal(summary.totalTokens, 465);
});

test("scans a single session file", async () => {
  const dir = await createFixtureDir();
  const summary = await scanSessionFile(join(dir, "one.jsonl"));

  assert.equal(summary.files, 1);
  assert.equal(summary.sessions, 1);
  assert.equal(summary.errors, 0);
  assert.equal(summary.turns, 1);
  assert.equal(summary.totalTokens, 150);
});

test("formats human and JSON summaries", () => {
  const summary = createUsageSummary();
  addAssistantUsage(
    summary,
    assistant("claude-sonnet-4-20250514", "anthropic", usage(100, 50, 0.0015)),
  );

  const formatted = formatSummary(summary, {
    title: "Pi current session usage",
  });
  assert.match(formatted, /Pi current session usage/);
  assert.match(formatted, /Tokens: 150 total/);
  assert.match(formatted, /anthropic\/claude-sonnet-4-20250514/);

  const json = serializableSummary(summary);
  assert.equal(json.totalTokens, 150);
  assert.equal(json.cost.total, 0.0015);
  assert.equal(json.models.length, 1);
});

test("registers /usage command and reports current branch", async () => {
  const commands = new Map();
  const notifications = [];
  const pi = {
    registerCommand(name, options) {
      commands.set(name, options);
    },
  };
  const ctx = {
    hasUI: true,
    ui: {
      notify(message, type) {
        notifications.push({ message, type });
      },
    },
    sessionManager: {
      getBranch() {
        return [
          {
            type: "message",
            message: assistant(
              "claude-sonnet-4-20250514",
              "anthropic",
              usage(100, 50, 0.0015),
            ),
          },
        ];
      },
    },
  };

  piUsage(pi);

  assert.equal(typeof commands.get("usage").handler, "function");
  await commands.get("usage").handler([], ctx);

  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].type, "info");
  assert.match(notifications[0].message, /Pi current session usage/);
  assert.match(notifications[0].message, /150 total/);
});

test("reports all sessions from an explicit path", async () => {
  const dir = await createFixtureDir();
  const commands = new Map();
  const notifications = [];
  const pi = {
    registerCommand(name, options) {
      commands.set(name, options);
    },
  };
  const ctx = {
    hasUI: true,
    ui: {
      notify(message, type) {
        notifications.push({ message, type });
      },
    },
    sessionManager: {
      getBranch() {
        throw new Error("should not read current branch for --all");
      },
    },
  };

  piUsage(pi);
  await commands.get("usage").handler(["--all", "--path", dir], ctx);

  assert.match(notifications[0].message, /Pi lifetime usage/);
  assert.match(
    notifications[0].message,
    /Scanned: 3 sessions, 3 files, 1 errors/,
  );
});

test("parses command arguments from Pi string args", async () => {
  const dir = await createFixtureDir();
  const commands = new Map();
  const notifications = [];
  const pi = {
    registerCommand(name, options) {
      commands.set(name, options);
    },
  };
  const ctx = {
    hasUI: true,
    ui: {
      notify(message, type) {
        notifications.push({ message, type });
      },
    },
    sessionManager: {
      getBranch() {
        throw new Error("should not read current branch for --all");
      },
    },
  };

  piUsage(pi);
  await commands.get("usage").handler(`--all --path "${dir}"`, ctx);

  assert.match(notifications[0].message, /Pi lifetime usage/);
  assert.match(
    notifications[0].message,
    /Scanned: 3 sessions, 3 files, 1 errors/,
  );
});

test("shows zero-file scan details for lifetime usage", () => {
  const formatted = formatSummary(createUsageSummary(), {
    title: "Pi lifetime usage",
    includeScan: true,
  });

  assert.match(formatted, /Scanned: 0 sessions, 0 files, 0 errors/);
});
