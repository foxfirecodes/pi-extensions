const DEFAULT_STASH_KEY = "ctrl+s";
const KEYBIND_FLAG = "pi-stash-key";
const STATUS_ID = "pi-stash";

function configuredKeybind(pi) {
  const flagValue = pi.getFlag(KEYBIND_FLAG);
  return typeof flagValue === "string" ? flagValue : DEFAULT_STASH_KEY;
}

function formatStatus(ctx, keybind) {
  const text = `stash:${keybind}`;
  return ctx.ui.theme?.fg ? ctx.ui.theme.fg("accent", text) : text;
}

export default function piStash(pi) {
  let stashedPrompt;
  let restoreAfterNextMessage = false;
  let keybind = DEFAULT_STASH_KEY;

  function updateStatus(ctx) {
    if (!ctx.hasUI) return;
    ctx.ui.setStatus(
      STATUS_ID,
      stashedPrompt === undefined ? undefined : formatStatus(ctx, keybind),
    );
  }

  function restorePrompt(ctx, { notify = true } = {}) {
    if (!ctx.hasUI || stashedPrompt === undefined) return false;

    const prompt = stashedPrompt;
    stashedPrompt = undefined;
    restoreAfterNextMessage = false;

    ctx.ui.setEditorText(prompt);
    updateStatus(ctx);

    if (notify) {
      ctx.ui.notify("Restored stashed prompt.", "info");
    }

    return true;
  }

  function stashOrRestorePrompt(ctx) {
    if (!ctx.hasUI) return;

    const currentPrompt = ctx.ui.getEditorText();
    if (currentPrompt.trim()) {
      stashedPrompt = currentPrompt;
      restoreAfterNextMessage = true;

      ctx.ui.setEditorText("");
      updateStatus(ctx);
      ctx.ui.notify(
        `Prompt stashed. Press ${keybind} again or send the next message to restore it.`,
        "info",
      );
      return;
    }

    if (restorePrompt(ctx)) return;

    ctx.ui.notify("No prompt to stash.", "info");
  }

  pi.registerFlag(KEYBIND_FLAG, {
    description: `Keybinding for pi-stash prompt stash/restore (default: ${DEFAULT_STASH_KEY})`,
    type: "string",
  });

  pi.on("session_start", async (_event, ctx) => {
    keybind = configuredKeybind(pi);
    pi.registerShortcut(keybind, {
      description: "Stash or restore the current prompt",
      handler: stashOrRestorePrompt,
    });
    updateStatus(ctx);
  });

  pi.on("input", async (event, ctx) => {
    if (
      event.source !== "interactive" ||
      !restoreAfterNextMessage ||
      stashedPrompt === undefined
    ) {
      return { action: "continue" };
    }

    restorePrompt(ctx);
    return { action: "continue" };
  });
}
