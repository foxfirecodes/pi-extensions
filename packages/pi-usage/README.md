# pi-usage

Pi package that reports token usage and cost from session usage metadata.

## Behavior

Run `/usage` to report token and cost totals for the current session branch. Run `/usage --all` to scan all persisted session files under `~/.pi/agent/sessions`, or `$PI_CODING_AGENT_DIR/sessions` when that environment variable is set.

The report is grouped by provider and model, and includes turns, input tokens, output tokens, cache read/write tokens, total tokens, and cost.

Pi stores provider-reported usage on assistant messages in session JSONL files. This extension reads those `message.usage` fields. If old session entries do not contain usage metadata, they are skipped because exact cost cannot be reconstructed from transcript text alone.

## Commands

```bash
/usage
/usage --all
/usage --json
/usage --all --json
/usage --path /path/to/session-or-directory
```

## Install

```bash
pi install npm:@foxfirecodes/pi-usage
```

## Development

From this checkout:

```bash
pi install .
```

Or try it for one run:

```bash
pi -e /path/to/pi-extensions/packages/pi-usage
```

To run automated tests:

```bash
pnpm test
```
