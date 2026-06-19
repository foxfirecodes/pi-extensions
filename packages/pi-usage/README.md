# pi-usage

Pi package that reports token usage and cost from session usage metadata.

## Behavior

Run `/usage` to report token and cost totals for the current session branch. Run `/usage --all` to scan persisted session JSONL files from the default session roots:

- `$PI_SESSION_DIR`
- `$PI_CODING_AGENT_DIR/sessions`
- `~/.pi/agent/sessions`
- `~/.pi/sessions`

The report is grouped by provider and model, and includes turns, input tokens, output tokens, cache read/write tokens, total tokens, and cost.

Pi stores provider-reported usage on assistant messages in session JSONL files. This extension reads those `message.usage` fields, so `/usage --all` backfills from historical JSONL files even for sessions where the extension was not installed.

Run `/usage --project` to scan persisted sessions from the default roots but include only session files whose session metadata points at the current project directory. This also works with `--path` to filter a specific session directory or file.

If old session entries do not contain usage metadata, they are skipped because exact usage cannot be reconstructed from transcript text alone.

## Commands

```bash
/usage
/usage --all
/usage --backfill
/usage --project
/usage --json
/usage --all --json
/usage --project --path /path/to/session-or-directory
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
