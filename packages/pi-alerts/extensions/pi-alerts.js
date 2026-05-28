const BELL = "\x07";
const UI_BELL_INSTALLED = Symbol.for("@foxfirecodes/pi-alerts.uiBellInstalled");
const PROMPT_METHODS = ["select", "confirm", "input", "editor", "custom"];

function defaultBellOutput() {
  if (process.stdout?.isTTY) return process.stdout;
  if (process.stderr?.isTTY) return process.stderr;
  return undefined;
}

export function ringTerminalBell(output = defaultBellOutput()) {
  if (!output) return false;
  if ("isTTY" in output && output.isTTY === false) return false;

  try {
    output.write(BELL);
    return true;
  } catch {
    return false;
  }
}

function promptOptions(methodName, args) {
  if (
    methodName === "select" ||
    methodName === "confirm" ||
    methodName === "input"
  ) {
    return args[2];
  }

  return undefined;
}

function promptAlreadyAborted(methodName, args) {
  return Boolean(promptOptions(methodName, args)?.signal?.aborted);
}

export function installPromptBells(ui, ring = ringTerminalBell) {
  if (!ui || ui[UI_BELL_INSTALLED]) return false;

  let installed = false;

  for (const methodName of PROMPT_METHODS) {
    const original = ui[methodName];
    if (typeof original !== "function") continue;

    ui[methodName] = function promptBellWrapper(...args) {
      if (!promptAlreadyAborted(methodName, args)) {
        ring();
      }

      return original.apply(this, args);
    };

    installed = true;
  }

  if (installed) {
    Object.defineProperty(ui, UI_BELL_INSTALLED, {
      value: true,
      enumerable: false,
      configurable: true,
    });
  }

  return installed;
}

export default function piAlerts(pi) {
  pi.on("session_start", async (_event, ctx) => {
    if (ctx.hasUI) installPromptBells(ctx.ui);
  });

  pi.on("agent_end", async (_event, ctx) => {
    if (!ctx.hasUI || ctx.hasPendingMessages()) return;

    ringTerminalBell();
  });
}
