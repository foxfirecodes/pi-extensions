# pi-stash

Pi package that adds a prompt stash shortcut for the interactive editor.

## Behavior

Press the stash keybinding to push the current prompt aside and clear the editor. Press it again with an empty editor to restore the stashed prompt. If the editor has text while a prompt is already stashed, pressing the stash keybinding replaces the old stash with the current editor text.

You can also send another message while a prompt is stashed; pi-stash will restore the stashed prompt back into the editor immediately after that message is submitted.

This is useful when you have a longer prompt drafted but want to quickly ask or send something else first.

## Keybinding

The default keybinding is `ctrl+s`.

You can customize it with the `--pi-stash-key` extension flag:

```bash
pi --pi-stash-key ctrl+x
```

Or with an environment variable:

```bash
PI_STASH_KEY=ctrl+x pi
```

The key string uses pi's key format, for example `ctrl+x`, `ctrl+shift+s`, or `alt+s`. If your terminal swallows `ctrl+s` for flow control, choose a different key or disable XON/XOFF flow control in your shell.

## Install

```bash
pi install npm:@foxfirecodes/pi-stash
```

## Development

From this checkout:

```bash
pi install .
```

Or try it for one run:

```bash
pi -e /path/to/pi-extensions/packages/pi-stash
```

To run automated tests:

```bash
pnpm test
```
