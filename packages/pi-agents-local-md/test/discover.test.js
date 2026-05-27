import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { discoverAgentsLocalFiles } from "../extensions/agents-local-md.js";

test("discovers global and project AGENTS.local.md files from root to cwd", () => {
  const root = mkdtempSync(join(tmpdir(), "pi-agents-local-md-"));

  try {
    const agentDir = join(root, "agent");
    const projectDir = join(root, "project");
    const nestedDir = join(projectDir, "packages", "app");

    mkdirSync(agentDir, { recursive: true });
    mkdirSync(nestedDir, { recursive: true });

    writeFileSync(join(agentDir, "AGENTS.local.md"), "global");
    writeFileSync(join(projectDir, "AGENTS.local.md"), "project");
    writeFileSync(join(nestedDir, "AGENTS.local.md"), "nested");

    const contextFiles = discoverAgentsLocalFiles({ cwd: nestedDir, agentDir });

    assert.deepEqual(
      contextFiles.map((contextFile) => contextFile.content),
      ["global", "project", "nested"],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("skips paths already loaded by pi", () => {
  const root = mkdtempSync(join(tmpdir(), "pi-agents-local-md-"));

  try {
    const agentDir = join(root, "agent");
    const projectDir = join(root, "project");

    mkdirSync(agentDir, { recursive: true });
    mkdirSync(projectDir, { recursive: true });

    const globalPath = join(agentDir, "AGENTS.local.md");
    writeFileSync(globalPath, "global");
    writeFileSync(join(projectDir, "AGENTS.local.md"), "project");

    const contextFiles = discoverAgentsLocalFiles({
      cwd: projectDir,
      agentDir,
      excludePaths: [globalPath],
    });

    assert.deepEqual(
      contextFiles.map((contextFile) => contextFile.content),
      ["project"],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
