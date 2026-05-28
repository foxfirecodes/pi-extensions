# pi-alerts

Pi package that rings the terminal bell (`\a`) when pi needs your input.

## Behavior

- Rings when an agent turn ends and pi is ready for another prompt.
- Rings before extension UI prompts such as `select`, `confirm`, `input`, `editor`, and `custom` dialogs. This covers permission prompts built with `ctx.ui.confirm()`.

The bell is written directly to the attached terminal when one is available.

## Install

```bash
pi install npm:@foxfirecodes/pi-alerts
```

## Development

From this checkout:

```bash
pi install .
```

Or try it for one run:

```bash
pi -e /path/to/pi-extensions/packages/pi-alerts
```

To run automated tests:

```bash
pnpm test
```
