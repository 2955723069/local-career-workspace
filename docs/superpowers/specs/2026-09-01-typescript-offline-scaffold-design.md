# TypeScript Offline Scaffold Design

## Scope

This task creates the smallest maintainable browser application foundation for
T-F001-1. It does not implement domain repositories, migrations, settings,
authentication, remote APIs, resume processing, or any later feature task.

## Architecture

The application uses framework-free TypeScript rendered into a semantic HTML
root. `src/main.ts` is the only browser entry point and delegates rendering to
`src/app/createApp.ts`. The entry point performs no network, authentication, or
remote-database work. Vite produces relative asset URLs so the generated files
can be hosted by any static file server without a backend.

Vitest runs in jsdom. `tests/setup.ts` installs `fake-indexeddb`, giving tests a
browser-compatible IndexedDB implementation without changing production code.
One smoke test exercises a real IndexedDB open/write/read lifecycle, and another
starts the application while observing `fetch` to prove startup does not issue
HTTP requests.

## User Interface

The first screen is a compact local-workspace status view. It identifies the
tool, states that data remains in this browser, exposes an accessible live status
message, and names the future local work areas without presenting unfinished
controls. The layout is responsive, uses semantic elements, preserves visible
focus styles, and wraps long text on narrow screens.

## Build And Privacy Boundaries

The production command runs TypeScript checking before Vite. Only `index.html`
and the `src` dependency graph enter `dist`; tests and `node_modules` are not
copied. No API endpoint, API key, authentication package, service worker, or
runtime CDN dependency is introduced. Offline means the already-built static
assets start without an application network request; first-time asset delivery
still requires a local or static file server.

## Documentation And Verification

README documents installation, development, production preview, offline use,
and the IndexedDB/localStorage boundary. Verification consists of `npm test`,
`npm run build`, and a scan of `dist` for test files, dependency directories,
and common hard-coded secret patterns.
