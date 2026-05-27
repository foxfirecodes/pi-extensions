import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

const CONTEXT_FILENAME = "AGENTS.local.md";
const CONTEXT_BLOCK_TAG = "agents_local_context_files";
const CONTEXT_BLOCK_OPEN = `<${CONTEXT_BLOCK_TAG}>`;
const DISABLE_CONTEXT_FLAGS = new Set(["--no-context-files", "-nc"]);

function defaultAgentDir() {
  return process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent");
}

function contextFilesDisabled(argv = process.argv.slice(2)) {
  return argv.some((arg) => DISABLE_CONTEXT_FLAGS.has(arg));
}

function directoryWalkFromRoot(cwd) {
  const directories = [];
  let currentDir = resolve(cwd);
  const root = resolve("/");

  while (true) {
    directories.unshift(currentDir);

    if (currentDir === root) break;

    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) break;

    currentDir = parentDir;
  }

  return directories;
}

function readContextFile(filePath) {
  try {
    return {
      path: filePath,
      content: readFileSync(filePath, "utf-8"),
    };
  } catch (error) {
    console.warn(`Warning: Could not read ${filePath}: ${error}`);
    return undefined;
  }
}

export function discoverAgentsLocalFiles({
  cwd,
  agentDir = defaultAgentDir(),
  excludePaths = [],
}) {
  const contextFiles = [];
  const seenPaths = new Set(excludePaths.map((path) => resolve(path)));

  function addFromDir(dir) {
    const filePath = resolve(join(dir, CONTEXT_FILENAME));
    if (seenPaths.has(filePath) || !existsSync(filePath)) return;

    const contextFile = readContextFile(filePath);
    if (!contextFile) return;

    contextFiles.push(contextFile);
    seenPaths.add(filePath);
  }

  addFromDir(agentDir);

  for (const dir of directoryWalkFromRoot(cwd)) {
    addFromDir(dir);
  }

  return contextFiles;
}

function formatContextFiles(contextFiles) {
  const parts = [
    CONTEXT_BLOCK_OPEN,
    `The agents-local-md extension discovered ${CONTEXT_FILENAME} files. Treat them as additional project instructions. More specific files appear later.`,
  ];

  for (const contextFile of contextFiles) {
    parts.push(
      `<context_file path=${JSON.stringify(contextFile.path)}>`,
      contextFile.content.trimEnd(),
      "</context_file>",
    );
  }

  parts.push(`</${CONTEXT_BLOCK_TAG}>`);
  return parts.join("\n");
}

export default function agentsLocalMd(pi) {
  pi.on("before_agent_start", async (event) => {
    if (
      contextFilesDisabled() ||
      event.systemPrompt.includes(CONTEXT_BLOCK_OPEN)
    )
      return;

    const loadedContextPaths = (
      event.systemPromptOptions?.contextFiles ?? []
    ).map((contextFile) => contextFile.path);
    const cwd = event.systemPromptOptions?.cwd ?? process.cwd();
    const contextFiles = discoverAgentsLocalFiles({
      cwd,
      excludePaths: loadedContextPaths,
    });

    if (contextFiles.length === 0) return;

    return {
      systemPrompt: `${event.systemPrompt}\n\n${formatContextFiles(contextFiles)}`,
    };
  });
}
