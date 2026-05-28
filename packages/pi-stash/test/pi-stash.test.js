import assert from "node:assert/strict";
import test from "node:test";

import piStash from "../extensions/pi-stash.js";

function createPi({ flagValue } = {}) {
  const handlers = new Map();
  const shortcuts = [];
  const flags = [];

  return {
    flags,
    handlers,
    shortcuts,
    on(event, handler) {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
    },
    registerFlag(name, options) {
      flags.push({ name, options });
    },
    getFlag(name) {
      assert.equal(name, "pi-stash-key");
      return flagValue;
    },
    registerShortcut(shortcut, options) {
      shortcuts.push({ shortcut, options });
    },
  };
}

function createContext(initialText = "") {
  let editorText = initialText;
  const notifications = [];
  const statuses = new Map();

  return {
    ctx: {
      hasUI: true,
      ui: {
        getEditorText() {
          return editorText;
        },
        setEditorText(nextText) {
          editorText = nextText;
        },
        notify(message, type) {
          notifications.push({ message, type });
        },
        setStatus(id, text) {
          statuses.set(id, text);
        },
        theme: {
          fg(_color, text) {
            return text;
          },
        },
      },
    },
    notifications,
    statuses,
    get editorText() {
      return editorText;
    },
  };
}

async function loadExtension({ flagValue } = {}) {
  const pi = createPi({ flagValue });
  piStash(pi);

  assert.equal(pi.flags.length, 1);
  assert.equal(pi.flags[0].name, "pi-stash-key");

  const sessionStartHandlers = pi.handlers.get("session_start") ?? [];
  assert.equal(sessionStartHandlers.length, 1);

  const context = createContext();
  await sessionStartHandlers[0]({}, context.ctx);

  return { pi, context };
}

test("registers a default ctrl+s stash shortcut", async () => {
  const { pi } = await loadExtension();

  assert.equal(pi.shortcuts.length, 1);
  assert.equal(pi.shortcuts[0].shortcut, "ctrl+s");
  assert.equal(typeof pi.shortcuts[0].options.handler, "function");
});

test("uses the pi-stash-key flag when provided", async () => {
  const { pi } = await loadExtension({ flagValue: "ctrl+x" });

  assert.equal(pi.shortcuts.length, 1);
  assert.equal(pi.shortcuts[0].shortcut, "ctrl+x");
});

test("stashes current editor text and restores it on the next shortcut press", async () => {
  const { pi } = await loadExtension();
  const context = createContext("draft prompt");
  const handler = pi.shortcuts[0].options.handler;

  await handler(context.ctx);

  assert.equal(context.editorText, "");
  assert.equal(context.statuses.get("pi-stash"), "stash:ctrl+s");

  await handler(context.ctx);

  assert.equal(context.editorText, "draft prompt");
  assert.equal(context.statuses.get("pi-stash"), undefined);
});

test("overwrites an existing stash when the editor has text", async () => {
  const { pi } = await loadExtension();
  const context = createContext("first draft");
  const handler = pi.shortcuts[0].options.handler;

  await handler(context.ctx);
  context.ctx.ui.setEditorText("second draft");

  await handler(context.ctx);

  assert.equal(context.editorText, "");
  assert.equal(context.statuses.get("pi-stash"), "stash:ctrl+s");

  await handler(context.ctx);

  assert.equal(context.editorText, "second draft");
  assert.equal(context.statuses.get("pi-stash"), undefined);
});

test("restores stashed prompt after the next interactive message is sent", async () => {
  const { pi } = await loadExtension();
  const context = createContext("draft prompt");
  const shortcutHandler = pi.shortcuts[0].options.handler;
  const inputHandler = pi.handlers.get("input")[0];

  await shortcutHandler(context.ctx);
  context.ctx.ui.setEditorText("quick question");

  const result = await inputHandler(
    { text: "quick question", images: [], source: "interactive" },
    context.ctx,
  );

  assert.deepEqual(result, { action: "continue" });
  assert.equal(context.editorText, "draft prompt");
  assert.equal(context.statuses.get("pi-stash"), undefined);
});

test("does not restore for extension-injected messages", async () => {
  const { pi } = await loadExtension();
  const context = createContext("draft prompt");
  const shortcutHandler = pi.shortcuts[0].options.handler;
  const inputHandler = pi.handlers.get("input")[0];

  await shortcutHandler(context.ctx);
  context.ctx.ui.setEditorText("");

  await inputHandler(
    { text: "generated", images: [], source: "extension" },
    context.ctx,
  );

  assert.equal(context.editorText, "");
  assert.equal(context.statuses.get("pi-stash"), "stash:ctrl+s");
});

test("does not stash an empty prompt", async () => {
  const { pi } = await loadExtension();
  const context = createContext("   ");
  const handler = pi.shortcuts[0].options.handler;

  await handler(context.ctx);

  assert.equal(context.editorText, "   ");
  assert.equal(context.statuses.get("pi-stash"), undefined);
  assert.equal(context.notifications.at(-1).message, "No prompt to stash.");
});
