# TypeScript Offline Scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a tested, static TypeScript application that starts without authentication, a backend, or application HTTP requests.

**Architecture:** A framework-free Vite entry point delegates to a small DOM renderer. Vitest uses jsdom plus fake-indexeddb, while production output contains only the reachable application assets.

**Tech Stack:** TypeScript, Vite, Vitest, jsdom, fake-indexeddb

**Spec:** `docs/superpowers/specs/2026-09-01-typescript-offline-scaffold-design.md`

## Global Constraints

- Do not introduce registration, login, cloud accounts, server databases, or HTTP APIs.
- Keep future structured records and original files in IndexedDB; reserve localStorage for small UI settings and migration markers.
- Do not implement any F-001 follow-up repository or settings behavior in this task.
- Do not hard-code API keys or include tests, node_modules, or source dependencies in production output.

---

### Task 1: Test And Build Configuration

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `tests/setup.ts`
- Create: `.gitignore`

**Interfaces:**
- Consumes: npm and a supported Node.js runtime
- Produces: `npm run dev`, `npm test`, `npm run build`, and a jsdom test environment with global IndexedDB

- [x] **Step 1: Add the dependency manifest and test configuration**

  Declare Vite, TypeScript, Vitest, jsdom, and fake-indexeddb, configure Vitest
  to load `tests/setup.ts`, and make `npm test` a non-watch command.

- [x] **Step 2: Install dependencies**

  Run: `npm install`

  Expected: `package-lock.json` is created and npm exits successfully.

- [x] **Step 3: Confirm the empty suite is discoverable**

  Run: `npm test`

  Expected: Vitest starts; until Task 2 adds the first test it may report no tests.

### Task 2: IndexedDB And Offline Startup Smoke Tests

**Files:**
- Create: `tests/indexeddb.test.ts`
- Create: `tests/app.test.ts`
- Create: `index.html`

**Interfaces:**
- Consumes: global `indexedDB`; future `createApp(document)`
- Produces: regression coverage for IndexedDB read/write and request-free startup

- [x] **Step 1: Write the failing IndexedDB lifecycle test**

  Open a uniquely named database, create one object store, write a literal
  record, read it back, and assert the literal value. Close and delete the
  database in cleanup.

- [x] **Step 2: Run the IndexedDB test and verify the intended failure**

  Run: `npm test -- tests/indexeddb.test.ts`

  Expected: FAIL before `tests/setup.ts` installs fake-indexeddb, then PASS once
  the setup import is present.

- [x] **Step 3: Write the failing application startup test**

  Create a real DOM root, spy on `window.fetch`, call `createApp(document)`, and
  assert the visible local status plus zero fetch calls.

- [x] **Step 4: Run the startup test and verify the intended failure**

  Run: `npm test -- tests/app.test.ts`

  Expected: FAIL because `src/app/createApp.ts` does not exist.

### Task 3: Minimal Static Application

**Files:**
- Create: `src/app/createApp.ts`
- Create: `src/main.ts`
- Create: `src/styles.css`

**Interfaces:**
- Consumes: `Document` with an element whose ID is `app`
- Produces: `createApp(documentRef: Document): HTMLElement`

- [x] **Step 1: Implement the smallest renderer that passes the startup test**

  Locate `#app`, render semantic local-workspace status content, return the root,
  and throw a clear error when the root is absent. Do not call network APIs.

- [x] **Step 2: Add the browser entry and responsive styling**

  Import the stylesheet and call `createApp(document)`. Use only local CSS and
  system fonts, with semantic status and visible focus styling.

- [x] **Step 3: Run all tests**

  Run: `npm test`

  Expected: both IndexedDB and application smoke tests PASS without warnings.

### Task 4: Documentation And Production Verification

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: repository scripts and documented storage constraints
- Produces: installation, startup, offline-use, and local-storage guidance

- [x] **Step 1: Document the supported workflows and boundaries**

  Explain `npm install`, `npm run dev`, `npm run build`, `npm run preview`, offline
  behavior, IndexedDB ownership, and the limited role of localStorage.

- [x] **Step 2: Build production assets**

  Run: `npm run build`

  Expected: TypeScript and Vite succeed and create `dist/index.html` plus local
  hashed assets.

- [x] **Step 3: Inspect the production tree and scan for secrets**

  Run: `find dist -type f -print` and scan regular files for test filenames,
  `node_modules`, and common `sk-` API key patterns.

  Expected: no forbidden path or secret pattern is present.

- [x] **Step 4: Re-run the full test suite after build**

  Run: `npm test`

  Expected: all tests PASS.
