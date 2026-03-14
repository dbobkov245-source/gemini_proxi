# Bob Mini App MVP Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a secure Bob Telegram Mini App MVP in this Next.js project with server-side Telegram auth, a mobile dashboard, snapshot-backed data loading, and allowlisted actions.

**Architecture:** The public Next.js app gains a Bob Mini App page plus private Bob APIs. A server-side session gate protects the dashboard and action routes. Dashboard state comes from a normalized snapshot provider rather than direct runtime access, and actions forward only through explicit wrapper definitions.

**Tech Stack:** Next.js 14 app router, TypeScript, Node crypto, native `fetch`, React, Node test runner with `tsx`.

---

### Task 1: Add planning and test harness

**Files:**
- Create: `docs/plans/2026-03-14-bob-mini-app-design.md`
- Create: `docs/plans/2026-03-14-bob-mini-app-mvp.md`
- Modify: `package.json`

**Steps:**
1. Add the design and implementation plan docs.
2. Add a native test script using `tsx`.
3. Install the minimal dev dependency needed to run TypeScript tests.

### Task 2: Write failing tests for auth and action policy

**Files:**
- Create: `tests/bob/auth.test.ts`
- Create: `tests/bob/actions.test.ts`
- Create: `tests/bob/snapshot.test.ts`

**Steps:**
1. Write a failing test for Telegram `initData` validation and owner allowlist checks.
2. Write a failing test for signed Bob UI sessions.
3. Write a failing test for action allowlisting and payload validation.
4. Write a failing test for snapshot normalization and secret stripping.
5. Run `npm test` and confirm the expected failures.

### Task 3: Implement secure Bob server utilities

**Files:**
- Create: `lib/bob/config.ts`
- Create: `lib/bob/telegram-auth.ts`
- Create: `lib/bob/session.ts`
- Create: `lib/bob/actions.ts`
- Create: `lib/bob/snapshot.ts`
- Create: `lib/bob/surfaces.ts`

**Steps:**
1. Implement env-driven config loading.
2. Implement Telegram `initData` verification.
3. Implement signed short-lived session helpers.
4. Implement the action registry and request validation.
5. Implement snapshot loading for `demo`, `file`, and `url`.
6. Implement surface generation from normalized snapshot data.
7. Run `npm test` and confirm the tests turn green.

### Task 4: Add Bob API routes

**Files:**
- Create: `app/api/bob/session/route.ts`
- Create: `app/api/bob/dashboard/route.ts`
- Create: `app/api/bob/actions/route.ts`

**Steps:**
1. Add the session route for Telegram sign-in.
2. Add the dashboard route protected by Bob session cookies.
3. Add the action route protected by Bob session cookies and the action registry.
4. Re-run focused tests and `npm run build`.

### Task 5: Build the mobile Mini App UI

**Files:**
- Create: `app/bob/page.tsx`
- Create: `app/bob/bob-app.tsx`
- Create: `app/bob/bob-app.css`

**Steps:**
1. Add a phone-first Bob Mini App page.
2. Read Telegram WebApp context when available.
3. Sign in via `/api/bob/session`.
4. Load and render the dashboard surface JSON.
5. Wire action buttons to `/api/bob/actions`.
6. Keep the layout single-column and touch-friendly.

### Task 6: Verify and document rollout constraints

**Files:**
- Modify: `.env.example`
- Optionally modify: `app/page.tsx`

**Steps:**
1. Add Bob UI env documentation for bot token, allowlist, session secret, snapshot source, and action endpoints.
2. Add a simple link from the root page to `/bob`.
3. Run `npm test`.
4. Run `npm run build`.
5. Summarize the remaining deployment wiring needed for real VPS data and actions.
