# Bob Bridge Rollout

## Goal

Expose live Bob Mini App data to the public `/bob` page without publishing the private OpenClaw gateway.

## Shape

- Public Mini App stays in `gemini_proxi`.
- Bob runtime stays private on the VPS.
- Bob bridge is mounted inside the OpenClaw gateway at `http://127.0.0.1:18789/__bob__/bridge`.
- Only the bridge path should be published externally:
  - `GET /__bob__/bridge/healthz`
  - `GET /__bob__/bridge/snapshot`
  - `GET /__bob__/bridge/capabilities`
  - `POST /__bob__/bridge/actions/:id`

## Security Rules

- Keep the OpenClaw gateway on localhost and publish only `__bob__/bridge` via reverse proxy or tunnel.
- Require `Authorization: Bearer <token>` for everything except `/healthz`.
- Start with `BOB_BRIDGE_ACTION_IDS=run-model-diagnostics`.

## VPS Env

```bash
BOB_UI_LOCAL_HEALTH_URL=http://127.0.0.1:18789/healthz
BOB_UI_LOCAL_MODELS_PATH=/home/devops/.openclaw/agents/main/agent/models.json
BOB_UI_LOCAL_OPENCLAW_CONFIG_PATH=/home/devops/.openclaw/openclaw.json
BOB_UI_LOCAL_CRON_PATH=/home/devops/.openclaw/cron/jobs.json
BOB_UI_LOCAL_CONTAINER_NAME=openclaw-openclaw-gateway-1

BOB_BRIDGE_BEARER_TOKEN=replace-with-strong-secret
BOB_BRIDGE_ACTION_IDS=run-model-diagnostics
```

## Gateway Smoke

```bash
curl -sS http://127.0.0.1:18789/__bob__/bridge/healthz
curl -sS -H "Authorization: Bearer ..." \
  http://127.0.0.1:18789/__bob__/bridge/capabilities
curl -sS -H "Authorization: Bearer ..." \
  http://127.0.0.1:18789/__bob__/bridge/snapshot
```

## Public Mini App Env

```bash
BOB_UI_SNAPSHOT_SOURCE=url
BOB_UI_SNAPSHOT_URL=https://<public-host>/__bob__/bridge/snapshot
BOB_UI_SNAPSHOT_BEARER_TOKEN=replace-with-strong-secret
BOB_UI_ACTION_BASE_URL=https://<public-host>/__bob__/bridge/actions
BOB_UI_ACTION_BEARER_TOKEN=replace-with-strong-secret
BOB_UI_ACTION_IDS=run-model-diagnostics
```

## Smoke Checklist

1. `curl -sS http://127.0.0.1:18789/__bob__/bridge/healthz`
2. `curl -sS -H "Authorization: Bearer ..."` `http://127.0.0.1:18789/__bob__/bridge/capabilities`
3. `curl -sS -H "Authorization: Bearer ..."` `http://127.0.0.1:18789/__bob__/bridge/snapshot`
4. Open `/bob?demo=1` for UI sanity.
5. Open `/bob` from Telegram Mini App after setting live envs.
