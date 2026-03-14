# Bob Bridge Rollout

## Goal

Expose live Bob Mini App data to the public `/bob` page without publishing the private OpenClaw gateway.

## Shape

- Public Mini App stays in `gemini_proxi`.
- Bob runtime stays private on the VPS.
- A separate `bob-bridge` process runs next to Bob and exposes only:
  - `GET /healthz`
  - `GET /snapshot`
  - `GET /capabilities`
  - `POST /actions/:id`

## Security Rules

- Keep `bob-bridge` bound to `127.0.0.1` by default.
- Put HTTPS and public routing in front of it via reverse proxy or tunnel.
- Require `Authorization: Bearer <token>` for everything except `/healthz`.
- Keep `OPENCLAW` gateway itself on localhost only.
- Start with `BOB_BRIDGE_ACTION_IDS=run-model-diagnostics`.

## VPS Env

```bash
BOB_UI_LOCAL_HEALTH_URL=http://127.0.0.1:18789/healthz
BOB_UI_LOCAL_MODELS_PATH=/home/devops/.openclaw/agents/main/agent/models.json
BOB_UI_LOCAL_OPENCLAW_CONFIG_PATH=/home/devops/.openclaw/openclaw.json
BOB_UI_LOCAL_CRON_PATH=/home/devops/.openclaw/cron/jobs.json
BOB_UI_LOCAL_CONTAINER_NAME=openclaw-openclaw-gateway-1

BOB_BRIDGE_HOST=127.0.0.1
BOB_BRIDGE_PORT=8788
BOB_BRIDGE_BEARER_TOKEN=replace-with-strong-secret
BOB_BRIDGE_ACTION_IDS=run-model-diagnostics
```

## Start Command

```bash
npm run bob-bridge
```

## Public Mini App Env

```bash
BOB_UI_SNAPSHOT_SOURCE=url
BOB_UI_SNAPSHOT_URL=https://<public-bridge-host>/snapshot
BOB_UI_SNAPSHOT_BEARER_TOKEN=replace-with-strong-secret
BOB_UI_ACTION_BASE_URL=https://<public-bridge-host>/actions
BOB_UI_ACTION_BEARER_TOKEN=replace-with-strong-secret
BOB_UI_ACTION_IDS=run-model-diagnostics
```

## Smoke Checklist

1. `curl -sS http://127.0.0.1:8788/healthz`
2. `curl -sS -H "Authorization: Bearer ..."` `http://127.0.0.1:8788/capabilities`
3. `curl -sS -H "Authorization: Bearer ..."` `http://127.0.0.1:8788/snapshot`
4. Open `/bob?demo=1` for UI sanity.
5. Open `/bob` from Telegram Mini App after setting live envs.
