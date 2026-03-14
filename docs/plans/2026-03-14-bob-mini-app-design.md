# Bob Mini App MVP Design

**Date:** 2026-03-14

## Goal

Ship a secure, phone-first Bob operator panel that opens inside Telegram and shows Bob health, cron status, diagnostics, and reports without exposing raw `exec`, secrets, or the private OpenClaw gateway.

## Context

- Bob already runs as a private OpenClaw gateway on the VPS and should remain private.
- The public HTTPS surface already lives in this Next.js proxy project.
- The user primarily interacts with Bob from Telegram on a phone, so the UI must be optimized for Telegram Mini App usage.
- We want an A2UI-style declarative surface, but we do not want to take a moving preview dependency into the critical path for the first secure MVP.

## Recommendation

Build the first version as a secure Mini App shell in this Next.js app with:

- server-side Telegram `initData` validation
- short-lived Bob UI sessions
- a small declarative surface contract rendered by React
- read-only dashboard data plus a narrow allowlist of wrapper actions

This keeps the public entrypoint small, preserves the existing Bob runtime, and leaves a clean migration path to the official A2UI renderer later.

## Architecture

### Public entrypoint

- `GET /bob`
  - mobile-first Telegram Mini App page
  - if Telegram WebApp context is present, posts `initData` to the server
  - if not present, shows a safe local/demo mode only

### Private application APIs

- `POST /api/bob/session`
  - validates Telegram `initData`
  - checks that the Telegram user is explicitly allowed
  - returns a signed short-lived session cookie

- `GET /api/bob/dashboard`
  - requires a valid Bob UI session
  - reads a Bob snapshot from a configured provider
  - returns a declarative surface JSON payload for the mobile UI

- `POST /api/bob/actions`
  - requires a valid Bob UI session
  - accepts only a fixed allowlist of action IDs
  - forwards allowed actions to configured wrapper endpoints
  - never executes shell commands directly

## Snapshot Provider Contract

The UI needs real Bob state, but this Vercel-style public app cannot safely talk to the private OpenClaw localhost endpoint directly. The MVP therefore reads state from a provider contract:

- `demo`
  - built-in safe example data
- `file`
  - reads a JSON file path on the host
- `url`
  - fetches a remote JSON snapshot using a bearer token

The snapshot is normalized before rendering so that:

- only known cards/fields are exposed
- secrets and unknown blobs are dropped
- the UI never renders raw HTML

## Action Model

MVP actions are server-side wrappers, not generic tool calls:

- `refresh-dashboard`
- `run-model-diagnostics`
- `run-radar`
- `run-cron-now`
- `pause-cron`
- `resume-cron`
- `restart-gateway`

Each action has:

- an ID
- a risk level
- a human label
- a required payload schema
- an optional configured upstream URL

If an action endpoint is not configured, the server returns a controlled `501 Not Implemented` response instead of falling back to raw runtime access.

## Security Model

- OpenClaw stays private on `127.0.0.1`.
- Telegram auth is validated on the server using the bot token.
- Bob UI sessions are signed and short-lived.
- Only the owner allowlist is accepted for privileged access.
- The browser never receives bot tokens, gateway tokens, OAuth tokens, or raw config files.
- The dashboard API returns only normalized JSON, never raw logs or shell output by default.
- Actions are allowlisted and auditable.
- No endpoint accepts arbitrary command strings.

## UI Shape

The mobile UI is a single-column card layout with:

- top system status card
- model diagnostics card
- cron jobs card
- reports card
- actions grouped behind explicit buttons

The first version favors fast comprehension over density and does not use desktop-style tables.

## A2UI Strategy

The MVP uses a small internal declarative surface schema:

- surface
- sections
- cards
- actions

This is intentionally close to A2UI’s direction so that a later swap to the official renderer is mechanical, but it avoids taking a preview dependency into the first secure release.

## Out of Scope

- raw `exec`
- direct OpenClaw gateway exposure
- filesystem browsing
- arbitrary tool invocation
- full incident log viewer
- non-owner write access

## Success Criteria

- the page works inside Telegram on mobile
- only validated Telegram owner sessions can access non-demo data
- dashboard rendering is driven by normalized server JSON
- action handling is allowlisted and cannot become a generic command channel
- the app still builds cleanly in this repo
