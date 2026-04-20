<p align="left">
  <img src="https://raw.githubusercontent.com/76836/Akari/main/images/banner.png" width="100%" alt="AkariNet"/>
</p>

> ### **This repository is a part of the [AkariNet](https://github.com/76836/Akari/tree/main) project.**

---

# AkariNet Automata

AkariNet Automata provides a package format (`.atpk`) and runtime loader for modular, event-driven AkariNet behaviors.

This repo now includes a **new ATPK loader build (`ATPKLoader-1.1.0.js`)** with improved parser validation, dependency sorting, duplicate handling, and safer runtime checks.

## What's in this repository

- `ATPKLoader-1.0.0.js` — legacy loader (kept for compatibility).
- `ATPKLoader-1.1.0.js` — current loader with parser/runtime improvements.
- `demo.atpk` — example automata package.
- `automatonManager.html` — management UI for package editing/import.

---

## Integration Guide (Recommended)

### 1) Add the loader to your project

You can either copy `ATPKLoader-1.1.0.js` into your codebase or host it from your own CDN path.

```html
<script src="./ATPKLoader-1.1.0.js"></script>
<script>
  // Create the runtime loader instance
  const automatonLoader = new AutomatonLoader();
</script>
```

### 2) Ensure expected host APIs exist

Automata typically rely on host globals/functions such as:

- `on(eventName, handler)`
- `emit(eventName, payload)`
- `say(text)`
- `log(level, message, extra)`
- `showNotification(title, message, options)`
- `AKARI.automata._registry` (optional, but supported)

If some APIs are not available in your environment, either polyfill them or avoid automata that require them.

### 3) Configure package sources

```js
const automatonLoader = new AutomatonLoader();

automatonLoader.setAutomataUrls([
  '/automata/core.atpk',
  '/automata/extensions.atpk'
]);

await automatonLoader.loadAll();
```

### 4) Optional: manage blacklist

```js
automatonLoader.setBlacklist(['experimental-module']);
```

Blacklisted automata are skipped during package load.

---

## ATPK file format

An `.atpk` package supports package metadata + one or more `!AUTOMATON` blocks.

```txt
atpk-name: sample-pack
atpk-description: Example package for AkariNet

!AUTOMATON
name: hello-world
version: 1.0.0
description: Basic hello responder
author: you
priority: 80
respondsto: message_sent
controls: say
dependencies:
code>
module.exports.default = {
  setup() {
    on('message_sent', (event) => {
      if (event.message.toLowerCase() === 'hello') say('Hello from automata!');
    });
  },
  teardown() {
    // optional cleanup
  }
};
<code
```

### Required automaton fields

- `name`
- `version`
- `description`
- `code` block (`code>` ... `<code`)

### Optional automaton fields

- `author`
- `priority` (default: `100`)
- `respondsto` (comma-separated)
- `controls` (comma-separated)
- `dependencies` (comma-separated automaton names)

---

## Runtime control methods

`AutomatonLoader` exposes runtime management methods:

- `list()`
- `listAll()`
- `info(name)`
- `shutdown(name)`
- `kill(name)`
- `restart(name)`
- `getConflicts()`
- `loadPackage(url)`
- `loadAll()`

---

## Notes on loader v1.1.0 improvements

- Stricter parser errors for invalid/missing blocks.
- Better handling for malformed localStorage values.
- Duplicate automaton detection in a single package.
- Dependency cycle detection while sorting automata.
- Replacement-safe automaton reload when names collide.
- Export validation to catch broken automaton modules early.

---

## Sanity check snippet

Use this after wiring everything to validate your integration quickly:

```js
const loader = new AutomatonLoader();
loader.setAutomataUrls(['/automata/demo.atpk']);
await loader.loadAll();

console.log('Loaded automata:', loader.list());
console.log('Conflicts:', loader.getConflicts());
```

If `loader.list()` is empty, inspect network requests and ensure your `.atpk` syntax matches the format above.
