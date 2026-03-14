# Bob Mini App — HA Section Design

**Date:** 2026-03-14
**Status:** Approved

## Goal

Add Home Assistant control to the Bob Telegram Mini App: vacuum (Shustrik) and soundbar (Polk) status + actions. Also merge the existing `codex/bob-mini-app-mvp` branch to main so the MVP is deployed to Vercel production.

## Scope

Two sequential milestones:

1. **Merge MVP to production** — `git merge codex/bob-mini-app-mvp` → main → Vercel auto-deploy
2. **HA section** — new "Home" dashboard section with vacuum + polk cards, snapshot fields, bridge actions, UI

## Architecture

```
Mini App UI
  → POST /api/bob/actions (Vercel)
    → BOB_BRIDGE_URL (Tailscale Funnel)
      → /__bob__/bridge/actions/ha-* (OpenClaw gateway)
        → Python scripts (ha_status.py, polk_say.py)
          → HA API (Tailscale → NAS:8123)
```

The existing action system already supports arbitrary payloads — only new action handler registrations needed in the gateway bridge.

## Snapshot Schema Addition

```typescript
// lib/bob/types.ts — extend BobSnapshot
ha: {
  vacuum: {
    state: "docked" | "cleaning" | "returning" | "error" | "unknown";
    battery: number; // 0-100
  };
  polk: {
    state: "on" | "off" | "idle" | "unknown";
    volume: number; // 0-100
    mediaTitle: string | null;
  };
}
```

Populated by calling `python3 ha_status.py all` during `/api/bob/dashboard` snapshot fetch. Falls back to `unknown` / 0 if HA unreachable.

## Dashboard UI

New section **"Home"** inserted between Cron and Reports.

### Shustrik card

| Row | Value |
|-----|-------|
| State | docked / cleaning / returning / error |
| Battery | 87% |

Actions (state-changing risk): `▶ Start`, `⏹ Stop`, `🏠 Dock`

### Polk card

| Row | Value |
|-----|-------|
| State | on / idle / off |
| Volume | 45% |
| Now playing | "..." (or hidden if null) |

Actions:
- `🔊 Say` — expands inline text input → submits `ha-polk-say` with `{ text }`
- `🔉 −10` / `🔊 +10` — submits `ha-polk-volume` with `{ delta: -10 }` / `{ delta: 10 }`

## New Bridge Actions (OpenClaw gateway)

| Action ID | Payload | Shell command |
|-----------|---------|---------------|
| `ha-vacuum-start` | — | `python3 /home/node/.openclaw/workspace/skills/mcp-hass/scripts/ha_status.py start` |
| `ha-vacuum-stop` | — | `python3 /home/node/.openclaw/workspace/skills/mcp-hass/scripts/ha_status.py stop` |
| `ha-vacuum-dock` | — | `python3 /home/node/.openclaw/workspace/skills/mcp-hass/scripts/ha_status.py dock` |
| `ha-polk-say` | `{ text: string }` | `python3 /home/node/.openclaw/workspace/skills/mcp-hass/scripts/polk_say.py <text>` |
| `ha-polk-volume` | `{ delta: number }` | HA REST API `media_player.volume_set` |

All HA actions added to the bridge allowlist. Risk level: `state-changing`.

## Files Changed

### Vercel (`gemini_proxi`)

| File | Change |
|------|--------|
| `lib/bob/types.ts` | Add `ha` field to `BobSnapshot` |
| `lib/bob/snapshot.ts` | Parse `ha` from bridge response; fallback shape |
| `lib/bob/surfaces.ts` | Add "Home" section with vacuum + polk cards |
| `lib/bob/actions.ts` | Document new action IDs (execution is on gateway side) |
| `app/bob/bob-app.tsx` | Inline TTS text input UI for polk-say |
| `app/bob/bob-app.css` | Styles for TTS input + volume buttons |

### OpenClaw gateway (TypeScript source, requires rebuild)

| File | Change |
|------|--------|
| `src/gateway/bob-bridge.ts` (or equivalent) | Register 5 new HA action handlers |

### Python scripts (already exist, no changes needed)

- `ha_status.py` — already supports `start`, `stop`, `dock`, `all`
- `polk_say.py` — already supports TTS
- Volume: use direct HA REST API (`HASS_BASE_URL` + `HASS_ACCESS_TOKEN` from env)

## Error Handling

- HA unreachable → snapshot `ha` fields = unknown/0, cards still render with "HA offline" tone
- Action fails → surface error toast in Mini App (existing error flow)
- Invalid text for polk-say → client-side: disable button if empty

## Out of Scope

- Room-by-room vacuum cleaning (requires Xiaomi cloud map)
- Polk media browser / source switching
- Other HA devices (lights, climate) — future iteration
