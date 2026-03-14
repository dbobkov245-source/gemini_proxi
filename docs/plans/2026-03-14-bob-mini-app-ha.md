# Bob Mini App — HA Section Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deploy the MVP Mini App to Vercel production, add live data bridge (Python server on VPS), add Home section with Shustrik + Polk controls.

**Architecture:** Python bridge server runs on VPS host (port 18791) → reads local files + runs `docker exec` → Tailscale Funnel exposes it publicly → Vercel Mini App fetches via Funnel URL. No OpenClaw gateway TS rebuild needed for the bridge itself.

**Tech Stack:** Python 3 (bridge server), Next.js (Vercel Mini App), TypeScript (lib/bob), Tailscale Funnel

---

### Task 0: Merge MVP branch to main

**Files:**
- gemini_proxi repo (git operations only)

**Step 1: Merge**

```bash
cd "/Volumes/SSD Storage/BoB/gemini_proxi"
git checkout main
git merge codex/bob-mini-app-mvp --no-ff -m "feat: merge Bob Mini App MVP (secure UI, bridge, Telegram /ops)"
```

Expected: merge succeeds. If package-lock.json conflicts → accept both and run `npm install` to regenerate.

**Step 2: Push to trigger Vercel deploy**

```bash
git push origin main
```

Expected: Vercel auto-deploys from main. Check at https://vercel.com/dens-projects-42007a48 that deploy is green.

**Step 3: Smoke demo mode**

Open `https://gemini-proxi.vercel.app/bob?demo=1` in browser.
Expected: Mini App loads with demo data (System / Models / Cron / Reports sections).

---

### Task 1: Add `--json` mode and HA commands to ha_status.py

**Files:**
- Modify: `/home/devops/.openclaw/workspace/skills/mcp-hass/scripts/ha_status.py` (bind-mounted, no rebuild)

**Step 1: Read current file**

```bash
ssh devops@212.109.195.59 'docker exec openclaw-openclaw-gateway-1 cat /home/node/.openclaw/workspace/skills/mcp-hass/scripts/ha_status.py'
```

**Step 2: Add JSON mode + vacuum commands + volume control**

Add after `POLK_ENTITY` constant:

```python
HA_SERVICES = {
    "vacuum-start":  ("vacuum",       "start",          {"entity_id": "vacuum.shustrik"}),
    "vacuum-stop":   ("vacuum",       "stop",           {"entity_id": "vacuum.shustrik"}),
    "vacuum-dock":   ("vacuum",       "return_to_base", {"entity_id": "vacuum.shustrik"}),
}
```

Add `hass_call_service` helper after `hass_get_json`:

```python
def hass_call_service(base_url: str, token: str, domain: str, service: str, data: dict) -> int:
    body = json.dumps(data).encode()
    req = urllib.request.Request(
        f"{base_url}/api/services/{domain}/{service}",
        data=body,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return resp.getcode()
    except urllib.error.HTTPError as err:
        return err.code
    except urllib.error.URLError as err:
        raise SystemExit(f"HA service call failed: {err.reason}") from err


def hass_set_volume(base_url: str, token: str, entity_id: str, delta: int) -> int:
    """Get current volume, apply delta, clamp 0-100, set."""
    code, payload = hass_get_json(base_url, token, f"/api/states/{entity_id}")
    if code != 200 or not isinstance(payload, dict):
        return code
    attrs = payload.get("attributes", {})
    current = int(round(float(attrs.get("volume_level", 0.5)) * 100))
    new_level = max(0, min(100, current + delta)) / 100.0
    return hass_call_service(base_url, token, "media_player", "volume_set",
                             {"entity_id": entity_id, "volume_level": new_level})
```

Add `format_snapshot_json` function:

```python
def format_snapshot_json(vacuum_entity: str | None, vacuum_state: dict | None,
                         polk_state: dict | None) -> dict:
    """Return structured HA snapshot for the bridge server."""
    v_attrs = (vacuum_state or {}).get("attributes", {})
    p_attrs = (polk_state or {}).get("attributes", {})
    return {
        "vacuum": {
            "state": str((vacuum_state or {}).get("state", "unknown")).lower(),
            "battery": int(v_attrs.get("battery_level", 0)),
        },
        "polk": {
            "state": str((polk_state or {}).get("state", "unknown")).lower(),
            "volume": int(round(float(p_attrs.get("volume_level", 0)) * 100)),
            "mediaTitle": p_attrs.get("media_title") or None,
        },
    }
```

Update `main()` to handle new modes:

```python
# Add at top of main() before existing mode handling:
if mode in HA_SERVICES:
    domain, service, data = HA_SERVICES[mode]
    code = hass_call_service(base_url, token, domain, service, data)
    print(f"service {domain}.{service}: {code}")
    return 0 if code in (200, 201) else 1

if mode == "volume-up":
    code = hass_set_volume(base_url, token, POLK_ENTITY, +10)
    print(f"volume set: {code}")
    return 0 if code in (200, 201) else 1

if mode == "volume-down":
    code = hass_set_volume(base_url, token, POLK_ENTITY, -10)
    print(f"volume set: {code}")
    return 0 if code in (200, 201) else 1

if mode == "json":
    result = format_snapshot_json(vacuum_entity, vacuum_state, polk_state)
    print(json.dumps(result))
    return 0 if vacuum_state or polk_state else 1
```

**Step 3: Test the new modes inside container**

```bash
ssh devops@212.109.195.59 '
docker exec openclaw-openclaw-gateway-1 python3 /home/node/.openclaw/workspace/skills/mcp-hass/scripts/ha_status.py json
docker exec openclaw-openclaw-gateway-1 python3 /home/node/.openclaw/workspace/skills/mcp-hass/scripts/ha_status.py vacuum-dock
'
```

Expected for json mode:
```json
{"vacuum": {"state": "docked", "battery": 87}, "polk": {"state": "off", "volume": 0, "mediaTitle": null}}
```

**Step 4: Test polk-say still works**

```bash
ssh devops@212.109.195.59 'docker exec openclaw-openclaw-gateway-1 python3 /home/node/.openclaw/workspace/skills/mcp-hass/scripts/polk_say.py тест'
```

Expected: TTS queued confirmation.

---

### Task 2: Write Python bridge server

**Files:**
- Create: `/home/devops/bob_bridge.py` (on VPS host, not inside container)

**Step 1: Create the script**

```bash
cat > /home/devops/bob_bridge.py << 'PYEOF'
#!/usr/bin/env python3
"""Bob Bridge Server — serves live Bob runtime data to the Mini App via Tailscale Funnel."""
from __future__ import annotations

import http.server
import json
import os
import subprocess
import sys
from urllib.parse import urlparse

BEARER_TOKEN = os.environ.get("BOB_BRIDGE_BEARER_TOKEN", "")
CONTAINER = "openclaw-openclaw-gateway-1"
CRON_PATH = "/home/devops/.openclaw/cron/jobs.json"
MODELS_PATH = "/home/devops/.openclaw/agents/main/agent/models.json"
CONFIG_PATH = "/home/devops/.openclaw/openclaw.json"
HEALTH_URL = "http://127.0.0.1:18789/healthz"
HA_SCRIPT = "/home/node/.openclaw/workspace/skills/mcp-hass/scripts/ha_status.py"
POLK_SCRIPT = "/home/node/.openclaw/workspace/skills/mcp-hass/scripts/polk_say.py"
ACTION_IDS = os.environ.get("BOB_BRIDGE_ACTION_IDS", "run-model-diagnostics").split(",")

PORT = int(os.environ.get("BOB_BRIDGE_PORT", "18791"))
HOST = os.environ.get("BOB_BRIDGE_HOST", "127.0.0.1")


def docker_exec(*cmd: str, timeout: int = 20) -> tuple[int, str]:
    try:
        r = subprocess.run(["docker", "exec", CONTAINER, *cmd],
                           capture_output=True, text=True, timeout=timeout)
        return r.returncode, r.stdout.strip()
    except subprocess.TimeoutExpired:
        return 1, "timeout"
    except Exception as e:
        return 1, str(e)


def read_json_file(path: str) -> dict | list | None:
    try:
        with open(path) as f:
            return json.load(f)
    except Exception:
        return None


def load_snapshot() -> dict:
    import urllib.request

    # Health
    try:
        with urllib.request.urlopen(HEALTH_URL, timeout=5) as r:
            health_ok = r.getcode() == 200
    except Exception:
        health_ok = False

    # Version
    rc, version = docker_exec("node", "-p", "require('/app/package.json').version")
    version = version if rc == 0 else "unknown"

    # Scripts present
    rc_sc, _ = docker_exec("ls", "/app/scripts/bob-models",
                            "/app/scripts/bob-models-fix", "/app/scripts/bob-compute")
    scripts_present = rc_sc == 0

    # Models
    models_raw = read_json_file(MODELS_PATH) or {}
    providers = models_raw.get("providers", {})
    codex_base = (providers.get("openai-codex") or {}).get("baseUrl", "unknown")

    # Cron
    cron_raw = read_json_file(CRON_PATH) or {}
    cron_jobs = []
    for job in cron_raw.get("jobs", []):
        if not job.get("enabled", True):
            continue
        state = job.get("state", {})
        consecutive = state.get("consecutiveErrors", 0)
        last_run = state.get("lastRunAt") or state.get("lastRunAtMs")
        if consecutive >= 2:
            status = "error"
        elif last_run:
            status = "ok"
        else:
            status = "idle"
        cron_jobs.append({"id": job["id"], "label": job.get("name", job["id"]), "status": status})

    # Compute today
    rc_comp, compute_out = docker_exec("python3", "/app/scripts/bob-compute", "--today", timeout=10)
    compute_today = compute_out.splitlines()[0] if rc_comp == 0 and compute_out else "n/a"

    # Primary model (from openclaw.json)
    cfg_raw = read_json_file(CONFIG_PATH) or {}
    primary_model = (
        (cfg_raw.get("agents", {}).get("defaults", {}).get("model") or {}).get("primary")
        or "unknown"
    )

    # HA status
    rc_ha, ha_out = docker_exec("python3", HA_SCRIPT, "json", timeout=15)
    try:
        ha_data = json.loads(ha_out) if rc_ha == 0 else {}
    except Exception:
        ha_data = {}

    ha_snapshot = {
        "vacuum": ha_data.get("vacuum", {"state": "unknown", "battery": 0}),
        "polk": ha_data.get("polk", {"state": "unknown", "volume": 0, "mediaTitle": None}),
    }

    return {
        "alerts": [],
        "cron": cron_jobs,
        "diagnostics": {
            "codexBaseUrl": codex_base,
            "scriptsPresent": scripts_present,
        },
        "ha": ha_snapshot,
        "models": {
            "computeToday": compute_today,
            "primary": primary_model,
        },
        "reports": [],
        "system": {
            "health": "healthy" if health_ok else "degraded",
            "version": version,
        },
    }


def run_action(action_id: str, payload: dict) -> tuple[bool, str]:
    if action_id not in ACTION_IDS and action_id not in [
        "ha-vacuum-start", "ha-vacuum-stop", "ha-vacuum-dock",
        "ha-polk-say", "ha-polk-volume",
    ]:
        return False, "action_not_allowed"

    if action_id == "run-model-diagnostics":
        rc, out = docker_exec("python3", "/app/scripts/bob-models", "--hours", "1", timeout=30)
        return rc == 0, out or "done"

    if action_id == "ha-vacuum-start":
        rc, out = docker_exec("python3", HA_SCRIPT, "vacuum-start", timeout=20)
        return rc == 0, out

    if action_id == "ha-vacuum-stop":
        rc, out = docker_exec("python3", HA_SCRIPT, "vacuum-stop", timeout=20)
        return rc == 0, out

    if action_id == "ha-vacuum-dock":
        rc, out = docker_exec("python3", HA_SCRIPT, "vacuum-dock", timeout=20)
        return rc == 0, out

    if action_id == "ha-polk-say":
        text = str(payload.get("text", "")).strip()
        if not text:
            return False, "missing_text"
        rc, out = docker_exec("python3", POLK_SCRIPT, text, timeout=20)
        return rc == 0, out

    if action_id == "ha-polk-volume":
        delta = int(payload.get("delta", 0))
        mode = "volume-up" if delta > 0 else "volume-down"
        rc, out = docker_exec("python3", HA_SCRIPT, mode, timeout=20)
        return rc == 0, out

    return False, "unknown_action"


class BobBridgeHandler(http.server.BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print(f"[bridge] {self.address_string()} {fmt % args}", flush=True)

    def send_json(self, status: int, data: dict) -> None:
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def check_auth(self) -> bool:
        auth = self.headers.get("Authorization", "")
        if not BEARER_TOKEN or auth != f"Bearer {BEARER_TOKEN}":
            self.send_json(401, {"error": "unauthorized"})
            return False
        return True

    def get_path(self) -> str:
        raw = urlparse(self.path).path
        # Strip /__bob__/bridge prefix if present (for gateway compat)
        for prefix in ("/__bob__/bridge", "/bob/bridge"):
            if raw.startswith(prefix):
                return raw[len(prefix):] or "/"
        return raw

    def do_GET(self) -> None:
        path = self.get_path()

        if path in ("/healthz", "/"):
            self.send_json(200, {"ok": True, "status": "live"})
            return

        if not self.check_auth():
            return

        if path == "/capabilities":
            ids = list(set(ACTION_IDS + [
                "ha-vacuum-start", "ha-vacuum-stop", "ha-vacuum-dock",
                "ha-polk-say", "ha-polk-volume",
            ]))
            self.send_json(200, {"actionIds": ids, "version": "1"})
            return

        if path == "/snapshot":
            try:
                snapshot = load_snapshot()
                self.send_json(200, snapshot)
            except Exception as e:
                self.send_json(502, {"error": str(e)})
            return

        self.send_json(404, {"error": "not_found"})

    def do_POST(self) -> None:
        path = self.get_path()

        if not self.check_auth():
            return

        if path.startswith("/actions/"):
            action_id = path[len("/actions/"):]
            length = int(self.headers.get("Content-Length", "0"))
            try:
                payload = json.loads(self.rfile.read(length)) if length > 0 else {}
            except Exception:
                payload = {}

            ok, result = run_action(action_id, payload)
            self.send_json(200 if ok else 502, {"ok": ok, "result": result})
            return

        self.send_json(404, {"error": "not_found"})


def main() -> None:
    if not BEARER_TOKEN:
        print("ERROR: BOB_BRIDGE_BEARER_TOKEN not set", file=sys.stderr)
        sys.exit(1)

    server = http.server.ThreadingHTTPServer((HOST, PORT), BobBridgeHandler)
    print(f"[bridge] listening on http://{HOST}:{PORT}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
PYEOF
chmod +x /home/devops/bob_bridge.py
```

**Step 2: Test bridge starts**

```bash
ssh devops@212.109.195.59 '
source /home/devops/openclaw/.env
export BOB_BRIDGE_BEARER_TOKEN BOB_BRIDGE_ACTION_IDS
timeout 3 python3 /home/devops/bob_bridge.py &
sleep 2
curl -sS http://127.0.0.1:18791/healthz
kill %1 2>/dev/null
'
```

Expected: `{"ok": true, "status": "live"}`

---

### Task 3: Deploy bridge server as persistent process

**Files:**
- Create: `/etc/systemd/system/bob-bridge.service` (via sudo) — OR use watchdog cron

**Step 1: Write systemd service**

```bash
ssh devops@212.109.195.59 'sudo tee /etc/systemd/system/bob-bridge.service > /dev/null << EOF
[Unit]
Description=Bob Bridge Server
After=network.target docker.service

[Service]
User=devops
WorkingDirectory=/home/devops
EnvironmentFile=/home/devops/openclaw/.env
ExecStart=/usr/bin/python3 /home/devops/bob_bridge.py
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable bob-bridge
sudo systemctl start bob-bridge
sleep 2
sudo systemctl status bob-bridge --no-pager'
```

Expected: `Active: active (running)`

**Step 2: Smoke**

```bash
ssh devops@212.109.195.59 '
TOKEN=$(grep BOB_BRIDGE_BEARER_TOKEN /home/devops/openclaw/.env | cut -d= -f2-)
curl -sS http://127.0.0.1:18791/healthz
curl -sS -H "Authorization: Bearer $TOKEN" http://127.0.0.1:18791/snapshot | python3 -m json.tool | head -20
'
```

Expected: healthz = `{"ok": true}`, snapshot = JSON with system/models/cron/ha sections.

---

### Task 4: Reconfigure Tailscale Funnel to port 18791

**Step 1: Remove old funnel, add new one**

```bash
ssh devops@212.109.195.59 '
sudo tailscale funnel reset
sudo tailscale funnel --bg --yes 18791
tailscale funnel status
'
```

Expected:
```
https://openclaw-vps.taild51c07.ts.net (Funnel on)
|-- / proxy http://127.0.0.1:18791
```

**Step 2: Test via public URL**

```bash
TOKEN=$(grep BOB_BRIDGE_BEARER_TOKEN "/Volumes/SSD Storage/BoB/.env" | cut -d= -f2-)
curl -sS https://openclaw-vps.taild51c07.ts.net/healthz
curl -sS -H "Authorization: Bearer $TOKEN" https://openclaw-vps.taild51c07.ts.net/snapshot | python3 -m json.tool | head -15
```

Expected: same JSON as local smoke.

---

### Task 5: Set Vercel env vars for live data

**Step 1: Get token and URL**

```bash
TOKEN=$(grep BOB_BRIDGE_BEARER_TOKEN "/Volumes/SSD Storage/BoB/.env" | cut -d= -f2-)
BOT_TOKEN=$(grep TELEGRAM_BOT_TOKEN "/Volumes/SSD Storage/BoB/.env" | cut -d= -f2-)
echo "TOKEN=$TOKEN"
echo "BOT_TOKEN=$BOT_TOKEN"
```

**Step 2: Set in Vercel (via CLI or dashboard)**

```bash
cd "/Volumes/SSD Storage/BoB/gemini_proxi"
vercel env add BOB_UI_SNAPSHOT_SOURCE production <<< "url"
vercel env add BOB_UI_SNAPSHOT_URL production <<< "https://openclaw-vps.taild51c07.ts.net/snapshot"
vercel env add BOB_UI_SNAPSHOT_BEARER_TOKEN production <<< "$TOKEN"
vercel env add BOB_UI_ACTION_BASE_URL production <<< "https://openclaw-vps.taild51c07.ts.net/actions"
vercel env add BOB_UI_ACTION_BEARER_TOKEN production <<< "$TOKEN"
vercel env add BOB_UI_ACTION_IDS production <<< "run-model-diagnostics,ha-vacuum-start,ha-vacuum-stop,ha-vacuum-dock,ha-polk-say,ha-polk-volume"
vercel env add BOB_UI_ALLOWED_USER_IDS production <<< "156025744"
vercel env add BOB_UI_SESSION_SECRET production <<< "$(openssl rand -hex 32)"
vercel env add BOB_UI_BOT_TOKEN production <<< "$BOT_TOKEN"
```

> If `vercel` CLI not available, set in https://vercel.com → Project → Settings → Environment Variables.

**Step 3: Trigger redeploy**

```bash
cd "/Volumes/SSD Storage/BoB/gemini_proxi"
git commit --allow-empty -m "chore: trigger Vercel redeploy with live env vars" && git push
```

---

### Task 6: Extend TypeScript types with `ha` field

**Files:**
- Modify: `lib/bob/types.ts`
- Test: `tests/bob/snapshot.test.ts`

**Step 1: Add `BobHaDevice` and `ha` to `BobSnapshot`**

In `lib/bob/types.ts`, after the existing type definitions, add:

```typescript
export type BobHaVacuum = {
  battery: number;
  state: string;
};

export type BobHaPolk = {
  mediaTitle: string | null;
  state: string;
  volume: number;
};

export type BobHa = {
  polk: BobHaPolk;
  vacuum: BobHaVacuum;
};
```

Add `ha: BobHa` to `BobSnapshot`:

```typescript
export type BobSnapshot = {
  alerts: BobAlert[];
  cron: BobCronJob[];
  diagnostics: { codexBaseUrl: string; scriptsPresent: boolean };
  ha: BobHa;
  models: { computeToday: string; primary: string };
  reports: BobReport[];
  system: { health: string; version: string };
};
```

**Step 2: Add test case**

In `tests/bob/snapshot.test.ts`, add:

```typescript
it("normalizes ha field from bridge response", () => {
  const raw = {
    system: { health: "healthy", version: "1.0" },
    models: { primary: "gpt-5.3-codex", computeToday: "0" },
    diagnostics: { codexBaseUrl: "https://example.com", scriptsPresent: true },
    cron: [],
    alerts: [],
    reports: [],
    ha: {
      vacuum: { state: "docked", battery: 87 },
      polk: { state: "off", volume: 45, mediaTitle: null },
    },
  };
  const snapshot = normalizeBobSnapshot(raw);
  expect(snapshot.ha.vacuum.state).toBe("docked");
  expect(snapshot.ha.vacuum.battery).toBe(87);
  expect(snapshot.ha.polk.volume).toBe(45);
  expect(snapshot.ha.polk.mediaTitle).toBeNull();
});

it("falls back to unknown ha state when ha missing", () => {
  const raw = { system: { health: "healthy", version: "1.0" }, models: {}, diagnostics: {}, cron: [], alerts: [], reports: [] };
  const snapshot = normalizeBobSnapshot(raw);
  expect(snapshot.ha.vacuum.state).toBe("unknown");
  expect(snapshot.ha.polk.state).toBe("unknown");
});
```

**Step 3: Run tests**

```bash
cd "/Volumes/SSD Storage/BoB/gemini_proxi"
npm test -- tests/bob/snapshot.test.ts
```

Expected: all snapshot tests pass.

**Step 4: Commit**

```bash
git add lib/bob/types.ts tests/bob/snapshot.test.ts
git commit -m "feat(bob): add BobHa types and snapshot tests"
```

---

### Task 7: Extend snapshot normalizer

**Files:**
- Modify: `lib/bob/snapshot.ts`

**Step 1: Add `normalizeHa` function**

After existing normalizers, add:

```typescript
function normalizeHa(input: unknown): BobHa {
  const record = input && typeof input === "object"
    ? (input as Record<string, unknown>)
    : {};

  const v = record.vacuum && typeof record.vacuum === "object"
    ? (record.vacuum as Record<string, unknown>)
    : {};
  const p = record.polk && typeof record.polk === "object"
    ? (record.polk as Record<string, unknown>)
    : {};

  return {
    vacuum: {
      battery: typeof v.battery === "number" ? v.battery : 0,
      state: typeof v.state === "string" ? v.state : "unknown",
    },
    polk: {
      mediaTitle: typeof p.mediaTitle === "string" ? p.mediaTitle : null,
      state: typeof p.state === "string" ? p.state : "unknown",
      volume: typeof p.volume === "number" ? p.volume : 0,
    },
  };
}
```

**Step 2: Wire into `normalizeBobSnapshot`**

```typescript
export function normalizeBobSnapshot(input: unknown): BobSnapshot {
  // ... existing code ...
  return {
    // ... existing fields ...
    ha: normalizeHa(record.ha),
  };
}
```

**Step 3: Add demo snapshot fallback**

In the demo snapshot builder (search for `"demo"` in snapshot.ts), add:

```typescript
ha: {
  vacuum: { state: "docked", battery: 87 },
  polk: { state: "off", volume: 45, mediaTitle: null },
},
```

**Step 4: Run tests**

```bash
npm test -- tests/bob/snapshot.test.ts
```

Expected: all pass (including new tests from Task 6).

**Step 5: Commit**

```bash
git add lib/bob/snapshot.ts
git commit -m "feat(bob): normalize ha field in snapshot"
```

---

### Task 8: Add Home section to surfaces

**Files:**
- Modify: `lib/bob/surfaces.ts`
- Test: `tests/bob/snapshot.test.ts` (add surface test)

**Step 1: Add Home section to `buildBobSurface`**

After the Models section, before Cron, add:

```typescript
{
  cards: [
    {
      actions: maybeActions(
        [
          { id: "ha-vacuum-start", label: "▶ Start", risk: "state-changing" },
          { id: "ha-vacuum-stop",  label: "⏹ Stop",  risk: "state-changing" },
          { id: "ha-vacuum-dock",  label: "🏠 Dock",  risk: "state-changing" },
        ],
        availableActions,
      ),
      rows: [
        { label: "State",   value: snapshot.ha.vacuum.state },
        { label: "Battery", value: `${snapshot.ha.vacuum.battery}%` },
      ],
      title: "Shustrik",
      tone: snapshot.ha.vacuum.state === "error" ? "warning" : undefined,
    },
    {
      actions: maybeActions(
        [
          { id: "ha-polk-say",    label: "🔊 Say",   risk: "state-changing" },
          { id: "ha-polk-volume", label: "🔉 −10",   risk: "state-changing", payload: { delta: "-10" } },
          { id: "ha-polk-volume", label: "🔊 +10",   risk: "state-changing", payload: { delta: "10" }  },
        ],
        availableActions,
      ),
      rows: [
        { label: "State",  value: snapshot.ha.polk.state },
        { label: "Volume", value: `${snapshot.ha.polk.volume}%` },
        ...(snapshot.ha.polk.mediaTitle
          ? [{ label: "Playing", value: snapshot.ha.polk.mediaTitle }]
          : []),
      ],
      title: "Polk",
    },
  ],
  id: "home",
  title: "Home",
},
```

**Step 2: Add surface action type for payload**

In `lib/bob/types.ts`, update `BobSurfaceAction`:

```typescript
export type BobSurfaceAction = {
  id: string;
  label: string;
  payload?: Record<string, string>;
  risk: string;
};
```

(This field already exists in the MVP code — verify it's there, add if missing.)

**Step 3: Commit**

```bash
git add lib/bob/surfaces.ts lib/bob/types.ts
git commit -m "feat(bob): add Home section with Shustrik + Polk controls"
```

---

### Task 9: Add TTS input and volume UI to bob-app.tsx

**Files:**
- Modify: `app/bob/bob-app.tsx`
- Modify: `app/bob/bob-app.css`

**Step 1: Add TTS input state**

Add to the component state:

```typescript
const [ttsText, setTtsText] = useState<string>("");
const [ttsPendingCardTitle, setTtsPendingCardTitle] = useState<string | null>(null);
```

**Step 2: Add special rendering for `ha-polk-say`**

In the action button rendering loop, detect `ha-polk-say` and render an input field instead of a button:

```tsx
{action.id === "ha-polk-say" ? (
  <div className="tts-input-row" key={`${card.title}-say`}>
    <input
      className="tts-input"
      placeholder="Текст для Полка…"
      value={ttsText}
      onChange={(e) => setTtsText(e.target.value)}
      disabled={!!pendingActionId}
    />
    <button
      className="action-btn action-btn--say"
      disabled={!ttsText.trim() || !!pendingActionId}
      onClick={() => {
        if (!ttsText.trim()) return;
        void handleAction("ha-polk-say", { text: ttsText });
        setTtsText("");
      }}
    >
      {action.label}
    </button>
  </div>
) : (
  <button
    key={action.id + (action.payload ? JSON.stringify(action.payload) : "")}
    className={`action-btn action-btn--${action.risk}`}
    disabled={pendingActionId === action.id}
    onClick={() => void handleAction(action.id, action.payload ?? {})}
  >
    {pendingActionId === action.id ? "…" : action.label}
  </button>
)}
```

Note: `handleAction` needs to accept a `payload` parameter — update the existing function signature if needed.

**Step 3: Add CSS for TTS input**

In `bob-app.css`:

```css
.tts-input-row {
  display: flex;
  gap: 6px;
  align-items: center;
  width: 100%;
}

.tts-input {
  flex: 1;
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px solid var(--tg-theme-hint-color, #888);
  background: var(--tg-theme-secondary-bg-color, #1e1e1e);
  color: var(--tg-theme-text-color, #fff);
  font-size: 14px;
}

.action-btn--say {
  flex-shrink: 0;
  white-space: nowrap;
}
```

**Step 4: Update `handleAction` to accept payload**

Find the `handleAction` function in `bob-app.tsx` and update the signature:

```typescript
async function handleAction(actionId: string, payload: Record<string, string> = {}) {
  setPendingActionId(actionId);
  try {
    await parseJsonResponse(
      await fetch("/api/bob/actions", {
        body: JSON.stringify({ actionId, payload }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    );
    // Refresh dashboard after action
    const dashboard = await parseJsonResponse(
      await fetch("/api/bob/dashboard", { cache: "no-store" }),
    );
    setState((s) => ({ ...s, surface: dashboard.surface }));
  } catch (e) {
    setState((s) => ({ ...s, note: e instanceof Error ? e.message : "action_failed" }));
  } finally {
    setPendingActionId(null);
  }
}
```

**Step 5: Build locally to check TypeScript**

```bash
cd "/Volumes/SSD Storage/BoB/gemini_proxi"
npm run build 2>&1 | tail -20
```

Expected: no TypeScript errors.

**Step 6: Commit**

```bash
git add app/bob/bob-app.tsx app/bob/bob-app.css
git commit -m "feat(bob): add TTS input and volume buttons for Polk"
```

---

### Task 10: Deploy and smoke test

**Step 1: Push to Vercel**

```bash
cd "/Volumes/SSD Storage/BoB/gemini_proxi"
git push origin main
```

Check Vercel build succeeds.

**Step 2: Full bridge smoke**

```bash
TOKEN=$(grep BOB_BRIDGE_BEARER_TOKEN "/Volumes/SSD Storage/BoB/.env" | cut -d= -f2-)
# healthz (no auth)
curl -sS https://openclaw-vps.taild51c07.ts.net/healthz

# snapshot (requires auth)
curl -sS -H "Authorization: Bearer $TOKEN" https://openclaw-vps.taild51c07.ts.net/snapshot | python3 -m json.tool

# HA vacuum dock (state-changing test)
curl -sS -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  https://openclaw-vps.taild51c07.ts.net/actions/ha-vacuum-dock
```

**Step 3: Open Mini App via Telegram**

Send `/ops` to `@Clawd_Bob245_bot` → tap "Open Bob Ops" → verify:
- System section: shows real version + health
- Models section: shows primary model + Codex route
- **Home section: Shustrik state + battery, Polk state + volume, action buttons present**
- Cron section: real job statuses

**Step 4: Test Polk TTS from Mini App**

Type "привет" in TTS input → tap "🔊 Say" → confirm Polk speaks.

**Step 5: Update AGENTS.md**

Add note under Bridge section that bridge is now a Python server on port 18791 (not gateway-embedded).

---

## After Completion

- Update `CLAUDE.md` — Bob Bridge is now `bob_bridge.py` on VPS host port 18791, systemd service `bob-bridge`
- Vercel production URL is now `https://gemini-proxi.vercel.app/bob` (main branch)
- Session doc: `docs/sessions/2026-03-14-bob-mini-app-ha.md`
