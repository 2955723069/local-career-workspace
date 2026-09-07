# Career Workspace Complete Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the seven-page local career workspace and fix notification, AI settings, JD import consistency, refresh, and data-management defects without changing the IndexedDB schema or backup protocol.

**Architecture:** Keep the existing domain services and IndexedDB stores. Add a top-level view coordinator and a small runtime dependency coordinator in `createApp`; expose matching and AI as reusable page components while keeping detail-page shortcuts. Use an explicit refresh event for cross-page consistency and timer handles owned by the notification service for in-page scheduling.

**Tech Stack:** TypeScript 7, Vite 8, browser IndexedDB, Web Crypto, Vitest/jsdom, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-03-career-workspace-complete-pages-design.md`

## Global Constraints

- Node.js 20.19+ and npm 10+ remain required.
- The app remains local-first, offline-capable, and has no account, server, or remote database.
- Do not change `DATABASE_VERSION`, IndexedDB store names, or the backup envelope/payload contract.
- API keys, resume/JD text, and private notes must not appear in logs, error text, or backup payloads.
- All user-visible async failures must preserve existing data and expose a recoverable status message.
- Existing nested application board/list state must not be controlled by the top-level page router.
- Run the focused test after each red/green cycle; run the full verification commands before completion.

### Task 1: Top-Level Router and Refresh Contract

**Files:**
- Modify: `src/app/createApp.ts`
- Modify: `src/main.ts`
- Modify: `src/styles/nav.css`
- Test: `tests/app.test.ts`

**Interfaces:**
- Produce `AppView = "overview" | "resumes" | "applications" | "interviews" | "matching" | "ai" | "settings"`.
- Produce `app-data-changed` and `app-view-changed` bubbling `CustomEvent`s with `{ view?: AppView, reason: string }` details.
- `setupViewNavigation(root, documentRef)` listens to `hashchange`, uses `history.pushState` for tab clicks, and only toggles top-level `.app-view` elements.

- [ ] **Step 1: Write failing tests**

Add tests that assert seven tabs, `aria-controls`, hash deep links, `hashchange` navigation, browser back navigation, and that `.application-board-view` remains visible after switching back to the applications page.

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- tests/app.test.ts`

Expected: failures for the missing matching/AI tabs, missing hashchange handling, and missing ARIA relationships.

- [ ] **Step 3: Implement minimal router and event helpers**

Split the current backup page into `data-view-panel="settings"`, add `matching` and `ai` panels, assign stable panel IDs, and update `showView` to call `history.pushState` for user clicks and respond to `hashchange`. Add a root helper:

```ts
function announceDataChanged(root: HTMLElement, reason: string): void {
  root.dispatchEvent(new CustomEvent("app-data-changed", {
    bubbles: true,
    detail: { reason },
  }));
}
```

Do not query nested `[data-view-panel]` elements.

- [ ] **Step 4: Run focused tests**

Run: `npm test -- tests/app.test.ts`

Expected: all application startup and navigation tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/createApp.ts src/main.ts src/styles/nav.css tests/app.test.ts
git commit -m "feat: add seven-page navigation and refresh events"
```

### Task 2: Settings, AI Configuration, and Scoped Data Management

**Files:**
- Modify: `src/app/createApp.ts`
- Modify: `src/settings/preferences.ts`
- Modify: `src/settings/secrets.ts`
- Modify: `src/storage/dataManagement.ts`
- Modify: `src/styles/layout.css`
- Create: `tests/settings/settings-ui.test.ts`

**Interfaces:**
- `createSettingsPage(documentRef, dependencies)` renders default timezone, default reminder controls, notification status, AI fields, test/save/clear actions, data preview, privacy text, backup panel, and derived AI send records.
- `SettingsDependencies` includes `database?: IDBDatabase`, `getAiSettings`, `saveAiSettings`, `clearAiSettings`, `testAiConnection`, `previewDataClear`, `clearAllData`.
- `clearAllData` removes only keys in `PREFERENCE_KEYS`; it continues to snapshot and restore all IndexedDB stores on failure.

- [ ] **Step 1: Write failing tests**

Cover saving/loading default timezone and reminders, AI key masking, connection-test failure not saving, save/clear status, notification button scoped to settings, derived conversation send records, and preserving unrelated localStorage keys during clear.

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- tests/settings/settings-ui.test.ts tests/settings/preferences.test.ts tests/storage/dataManagement.test.ts`

Expected: missing settings controls and incorrect global localStorage clearing cause failures.

- [ ] **Step 3: Implement settings UI and scoped clearing**

Add an AI form with `apiUrl`, `model`, `apiKey`, `organizationId`, and newline-delimited custom headers. Use `getAiSettings` on mount, display `已配置` instead of the key, call `validateAiSettings` before save, and call a supplied connection tester before persistence. Scope notification queries to `.settings-panel`. Replace `localStorage.clear()` with removal of `PREFERENCE_KEYS` only. Derive recent AI activity from `aiConversations` records and never include message content in the settings summary.

- [ ] **Step 4: Run focused tests**

Run: `npm test -- tests/settings/settings-ui.test.ts tests/settings/preferences.test.ts tests/storage/dataManagement.test.ts`

Expected: all settings and storage tests pass without exposing secrets.

- [ ] **Step 5: Commit**

```bash
git add src/app/createApp.ts src/settings/preferences.ts src/settings/secrets.ts src/storage/dataManagement.ts src/styles/layout.css tests/settings/settings-ui.test.ts
git commit -m "feat: complete local settings and scoped data management"
```

### Task 3: Correct Reminder Scheduling and Default Timezone Use

**Files:**
- Modify: `src/calendar/notifications.ts`
- Modify: `src/calendar/reminders.ts`
- Modify: `src/components/InterviewCalendar/InterviewCalendar.ts`
- Modify: `src/app/createApp.ts`
- Test: `tests/calendar/notifications.test.ts`
- Test: `tests/interviews/interview-ui.test.ts`

**Interfaces:**
- Add `NotificationService.scheduleAt(interview, reminder): Promise<NotificationResult>` and `cancelInterview(interviewId): void`.
- Add `NotificationService.restoreScheduled(interviews): Promise<void>` for page startup.
- Timer callbacks only create a browser notification when permission is granted and the reminder time is reached; failures write one `ReminderFailure` record.

- [ ] **Step 1: Write failing tests**

Use fake timers to prove future reminders do not call the Notification constructor immediately, call it after advancing to `reminderAt`, cancel old timers on reschedule, and restore future timers on startup. Add UI assertions that the form default timezone/reminders come from `getPreferences()`.

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- tests/calendar/notifications.test.ts tests/interviews/interview-ui.test.ts`

Expected: current implementation constructs Notification during save and uses hardcoded `Asia/Shanghai`/30-minute defaults.

- [ ] **Step 3: Implement timer ownership and timezone defaults**

Store timer handles by interview/reminder key. For a future reminder, schedule a timeout for the bounded delay; at callback time re-check permission and current time before constructing Notification. Cancel/rebuild timers for update, reschedule, cancel, and complete operations. Mark past reminders as due in the UI instead of firing immediately. Pass `getPreferences()` values into calendar creation and build the anchor date in the configured timezone.

- [ ] **Step 4: Run focused tests**

Run: `npm test -- tests/calendar/notifications.test.ts tests/interviews/interview-ui.test.ts`

Expected: reminder timing, failure persistence, cleanup, and defaults pass.

- [ ] **Step 5: Commit**

```bash
git add src/calendar/notifications.ts src/calendar/reminders.ts src/components/InterviewCalendar/InterviewCalendar.ts src/app/createApp.ts tests/calendar/notifications.test.ts tests/interviews/interview-ui.test.ts
git commit -m "fix: schedule interview reminders at their due time"
```

### Task 4: Atomic JD File Import and Resume Unbinding

**Files:**
- Modify: `src/features/applications/applicationService.ts`
- Modify: `src/features/job-descriptions/jobDescriptionService.ts`
- Modify: `src/components/ApplicationBoard/ApplicationBoard.ts`
- Test: `tests/applications/application-board.test.ts`
- Test: `tests/applications/job-description.test.ts`

**Interfaces:**
- Add `ApplicationService.createApplicationWithJobDescription(input, preparedJd): Promise<Application>` where `preparedJd` contains the validated `JobDescription`, optional `JobDescriptionText`, and optional `StoredFile`.
- Add `ApplicationService.unbindResume(applicationId): Promise<Application>` that writes a timeline event and clears `currentResumeId`.
- Keep `JobDescriptionService.ingestFile` as a preparation API or add `prepareFile`; the final write is one transaction.

- [ ] **Step 1: Write failing tests**

Test that malformed/duplicate JD input leaves no new application, that a write failure rolls back application/JD/text/blob together, and that selecting “未绑定” removes the existing current resume and records the change.

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- tests/applications/application-board.test.ts tests/applications/job-description.test.ts`

Expected: current submit flow creates the application before file ingestion and empty resume selections are ignored.

- [ ] **Step 3: Implement atomic preparation and explicit unbind**

Move file validation, hashing, parsing, and Blob creation before the write transaction. Use one transaction for application, stage validation, job description, text, and original file. On any error, return a recoverable error without leaving partial records. In both the create/edit form and detail form, call `unbindResume` when the selected value is empty and the existing application is bound. Reset `pendingJobDescriptionId` on every success, failure, and cancel path.

- [ ] **Step 4: Run focused tests**

Run: `npm test -- tests/applications/application-board.test.ts tests/applications/job-description.test.ts`

Expected: import rollback and bind/unbind tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/features/applications/applicationService.ts src/features/job-descriptions/jobDescriptionService.ts src/components/ApplicationBoard/ApplicationBoard.ts tests/applications/application-board.test.ts tests/applications/job-description.test.ts
git commit -m "fix: make JD import atomic and support resume unbinding"
```

### Task 5: Standalone JD Matching Page

**Files:**
- Create: `src/components/MatchingPage/MatchingPage.ts`
- Modify: `src/components/ApplicationBoard/ApplicationBoard.ts`
- Modify: `src/app/createApp.ts`
- Modify: `src/styles/matching.css`
- Create: `tests/matching/matching-ui.test.ts`

**Interfaces:**
- `createMatchingPage(documentRef, options): HTMLElement` accepts `applicationService.listApplications`, `resumeLibrary.search`, `matchingService.run/listHistory/get`, and `onOpenAi(applicationId)`.
- `renderAnalysisResult(result, resumeName, esc)` becomes a shared exported renderer used by the detail panel and page.

- [ ] **Step 1: Write failing tests**

Assert that the matching page lists applications and available resumes, runs local matching, displays coverage/evidence/history, shows recoverable missing-text errors, and emits an AI navigation request with the application ID.

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- tests/matching/matching-ui.test.ts`

Expected: module and page controls do not exist.

- [ ] **Step 3: Implement the page and share result rendering**

Create the page with labeled selectors, status region, run button, result sections, history buttons, and “进入 AI 顾问” action. Move the existing detail result template to the shared renderer and call it from both page and detail. On invalid IDs, clear selectors and show a recoverable message.

- [ ] **Step 4: Run focused tests**

Run: `npm test -- tests/matching/matching-ui.test.ts tests/matching/matching-service.test.ts tests/matching/scoring.test.ts`

Expected: page and matching engine tests pass with no network calls.

- [ ] **Step 5: Commit**

```bash
git add src/components/MatchingPage/MatchingPage.ts src/components/ApplicationBoard/ApplicationBoard.ts src/app/createApp.ts src/styles/matching.css tests/matching/matching-ui.test.ts
git commit -m "feat: add standalone JD matching page"
```

### Task 6: Standalone AI Page, Runtime Service Replacement, and Cross-Page Actions

**Files:**
- Create: `src/components/AiPage/AiPage.ts`
- Modify: `src/app/createApp.ts`
- Modify: `src/main.ts`
- Modify: `src/components/Dashboard/Dashboard.ts`
- Modify: `src/styles/ai.css`
- Create: `tests/ai/ai-settings-ui.test.ts`
- Modify: `tests/e2e/ai-career-advisor.spec.ts`

**Interfaces:**
- `createAiPage(documentRef, options): HTMLElement` accepts `getApplications`, `aiAdvisorService?: AiAdvisorService`, and `onOpenSettings`.
- `RuntimeServices` exposes `setAiSettings(settings): void`, `clearAiSettings(): void`, and `getAiAdvisorService(): AiAdvisorService | undefined`.
- Dashboard actions dispatch `open-review` and `retry-reminder` requests consumed by the root coordinator.

- [ ] **Step 1: Write failing tests**

Test AI page application selection, conversation loading, preview cancellation, confirmed send, settings-to-service replacement, clearing configuration, dashboard review navigation, and working reminder retry dispatch.

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- tests/ai/ai-settings-ui.test.ts tests/app.test.ts`

Expected: no standalone AI page or runtime replacement exists; dashboard events have no consumer.

- [ ] **Step 3: Implement AI page and event consumers**

Extract the detail AI form/conversation/result renderer into `AiPage`. Add a runtime service holder in `main.ts`/`createApp` so saving valid settings constructs a new OpenAI client and advisor service immediately. Keep preview confirmation mandatory and preserve failed conversations. On dashboard review action, switch to interviews and dispatch the selected interview ID to the review component. On retry, schedule the matching interview reminder through the notification service and refresh dashboard state.

- [ ] **Step 4: Run focused tests**

Run: `npm test -- tests/ai/ai-settings-ui.test.ts tests/ai/advisor-service.test.ts tests/app.test.ts`

Expected: AI settings, page behavior, and cross-page event tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/AiPage/AiPage.ts src/app/createApp.ts src/main.ts src/components/Dashboard/Dashboard.ts src/styles/ai.css tests/ai/ai-settings-ui.test.ts tests/e2e/ai-career-advisor.spec.ts
git commit -m "feat: add AI advisor page and wire dashboard actions"
```

### Task 7: Integration Regression, Accessibility, and Release Verification

**Files:**
- Modify: `tests/e2e/applications.spec.ts`
- Modify: `tests/e2e/interviews-reviews-dashboard.spec.ts`
- Modify: `tests/e2e/responsive-accessibility-workflow.spec.ts`
- Modify: `tests/e2e/ai-career-advisor.spec.ts`
- Modify: `README.md`

- [ ] **Step 1: Write failing integration assertions**

Extend E2E coverage for all seven tabs, browser back/forward, hash deep links, real homepage counters, settings AI configuration, notification retry, matching-page flow, clearing data with an unrelated localStorage key, and desktop/mobile layout.

- [ ] **Step 2: Run the integration tests to verify gaps**

Run: `npm run test:e2e`

Expected: failures identify remaining selectors, navigation assumptions, or stale component refreshes.

- [ ] **Step 3: Implement only integration fixes**

Wire `app-data-changed` listeners so every visible page reloads after create/update/import/clear. Update README sections for the seven pages, AI setup, reminder limitations, and data clearing behavior. Keep all user-facing copy in Chinese and ensure status regions are `aria-live`.

- [ ] **Step 4: Run the full verification suite**

Run:

```bash
npm test
npm run build
npm run check:production
npm run test:e2e
```

Expected: all Vitest tests pass, TypeScript/Vite build exits 0, production audit prints `Production audit passed`, and all Playwright projects pass.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e README.md
git commit -m "test: verify complete multi-page career workspace"
```
