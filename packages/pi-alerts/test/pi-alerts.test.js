import assert from "node:assert/strict";
import test from "node:test";

import piAlerts, {
  installPromptBells,
  ringTerminalBell,
} from "../extensions/pi-alerts.js";

function createOutput({ isTTY = true } = {}) {
  return {
    isTTY,
    chunks: [],
    write(chunk) {
      this.chunks.push(chunk);
    },
  };
}

test("exports a pi extension", () => {
  assert.equal(typeof piAlerts, "function");
});

test("registers session and agent-end handlers", () => {
  const handlers = new Map();
  const pi = {
    on(eventName, handler) {
      handlers.set(eventName, handler);
    },
  };

  piAlerts(pi);

  assert.equal(typeof handlers.get("session_start"), "function");
  assert.equal(typeof handlers.get("agent_end"), "function");
});

test("ringTerminalBell writes a bell to TTY output", () => {
  const output = createOutput();

  assert.equal(ringTerminalBell(output), true);
  assert.deepEqual(output.chunks, ["\x07"]);
});

test("ringTerminalBell skips non-TTY output", () => {
  const output = createOutput({ isTTY: false });

  assert.equal(ringTerminalBell(output), false);
  assert.deepEqual(output.chunks, []);
});

test("installPromptBells rings before extension UI prompts", async () => {
  const calls = [];
  const ui = {
    async select(title) {
      calls.push(["select", title]);
      return "selected";
    },
    async confirm(title, message) {
      calls.push(["confirm", title, message]);
      return true;
    },
    async input(title, placeholder) {
      calls.push(["input", title, placeholder]);
      return "typed";
    },
    async editor(title, prefill) {
      calls.push(["editor", title, prefill]);
      return "edited";
    },
    async custom() {
      calls.push(["custom"]);
      return "custom-result";
    },
  };
  let bells = 0;

  assert.equal(
    installPromptBells(ui, () => bells++),
    true,
  );

  assert.equal(await ui.select("Choose"), "selected");
  assert.equal(await ui.confirm("Allow?", "Run it?"), true);
  assert.equal(await ui.input("Name", "placeholder"), "typed");
  assert.equal(await ui.editor("Edit", "prefill"), "edited");
  assert.equal(await ui.custom(), "custom-result");

  assert.equal(bells, 5);
  assert.deepEqual(calls, [
    ["select", "Choose"],
    ["confirm", "Allow?", "Run it?"],
    ["input", "Name", "placeholder"],
    ["editor", "Edit", "prefill"],
    ["custom"],
  ]);
});

test("installPromptBells is idempotent for the same UI context", async () => {
  const ui = {
    async confirm() {
      return true;
    },
  };
  let bells = 0;

  assert.equal(
    installPromptBells(ui, () => bells++),
    true,
  );
  assert.equal(
    installPromptBells(ui, () => bells++),
    false,
  );

  await ui.confirm("Allow?", "Run it?");

  assert.equal(bells, 1);
});

test("installPromptBells skips prompts whose signal is already aborted", async () => {
  const ui = {
    async select() {
      return undefined;
    },
  };
  const controller = new AbortController();
  controller.abort();
  let bells = 0;

  installPromptBells(ui, () => bells++);
  await ui.select("Choose", ["A"], { signal: controller.signal });

  assert.equal(bells, 0);
});
