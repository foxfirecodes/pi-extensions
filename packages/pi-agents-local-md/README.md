# pi-agents-local-md

Pi package that autoloads `AGENTS.local.md` files as additional context.

## Behavior

On each agent turn, the extension discovers `AGENTS.local.md` from:

1. `~/.pi/agent/AGENTS.local.md` (or `$PI_CODING_AGENT_DIR/AGENTS.local.md`)
2. Parent directories, walking from filesystem root down to the current working directory
3. The current working directory

Discovered files are appended to the system prompt in that order, so more specific files appear later. If pi ever natively loads `AGENTS.local.md`, this extension skips paths that pi already reports as loaded context files.

The extension respects `--no-context-files` / `-nc` and does not inject local context when those flags are present.

## Install

```bash
pi install npm:@foxfirecodes/pi-agents-local-md
```

## Development

From this checkout:

```bash
pi install .
```

Or try it for one run:

```bash
pi -e /path/to/pi-extensions/packages/pi-agents-local-md
```

To run automated tests:

```bash
pnpm test
```
