# Gemini Proxy — Transparent Pass-Through Design

**Date:** 2026-03-01
**Status:** Approved
**Repo:** `bobbiclow/gemini-proxy`

## Problem

The VPS hosting Bob (OpenClaw) is in Russia. Google's Gemini API (`generativelanguage.googleapis.com`) geo-blocks requests from Russian IPs with: _"User location is not supported for the API use."_

The API key is valid. OpenClaw has native Gemini support configured. The only blocker is geography.

## Solution

Deploy a transparent proxy on Vercel (US/EU infrastructure, not geo-blocked) that:
- Accepts requests in the exact same format OpenClaw sends to Google
- Validates a shared secret
- Forwards to the real Gemini API with the real key

OpenClaw only needs a `baseUrl` change — no format translation, no code changes in OpenClaw itself.

## Architecture

```
Bob (VPS, Russia)
  ↓  POST /v1beta/models/gemini-2.5-flash:generateContent?key=PROXY_SECRET
Vercel Proxy (US/EU)
  ↓  POST generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=REAL_KEY
Google Gemini API
  ↓  response (pass-through)
Bob
```

## File Changes

### Delete
- `app/api/gemini/route.ts` — replaced by new catch-all route

### Create
- `app/v1beta/[...path]/route.ts` — transparent catch-all proxy

### Update
- `next.config.js` — CORS source path: `/api/:path*` → `/v1beta/:path*`
- `.env.example` — updated variable descriptions

## Route Logic (`app/v1beta/[...path]/route.ts`)

1. Extract `?key=` from incoming request
2. Validate against `PROXY_SECRET` env var → `401` if mismatch
3. Check `GEMINI_API_KEY` is set → `500` if missing
4. Reconstruct URL: `https://generativelanguage.googleapis.com/v1beta/[path]?key=GEMINI_API_KEY`
5. Forward request body as raw text (no parse/stringify)
6. Return Google's response as-is (status code + body)

Supports: `POST`, `GET`, `OPTIONS`

## Environment Variables (Vercel)

| Variable | Required | Description |
|---|---|---|
| `GEMINI_API_KEY` | yes | Real Google Gemini key (`AIzaSy...`) |
| `PROXY_SECRET` | yes | Shared secret for proxy auth (any strong string) |

- Both vars are required — server returns `500` if either is missing
- `GEMINI_API_KEY` never leaves Vercel servers
- Error responses to client: generic only (`Unauthorized`, `Proxy error`)

## Security

- Real API key only on Vercel (not on VPS, not in openclaw.json)
- `PROXY_SECRET` in openclaw.json acts as the "API key" for the proxy
- No error details leaked to client
- CORS: `*` (required for VPS → Vercel requests)

## Integration Steps (after deploy)

1. Vercel auto-deploys from `bobbiclow/gemini-proxy` on push to `main`
2. Add env vars in Vercel Dashboard: `GEMINI_API_KEY` + `PROXY_SECRET`
3. Update `openclaw.json` on VPS:
   ```json
   "google": {
     "baseUrl": "https://[vercel-url]/v1beta",
     "apiKey": "[PROXY_SECRET value]"
   }
   ```
4. Restart container: `docker compose up -d --force-recreate openclaw-gateway`
5. Test: ask Bob to respond using `/gemini`

## Success Criteria

Bob responds via `google/gemini-2.5-flash` without geo-block error.
