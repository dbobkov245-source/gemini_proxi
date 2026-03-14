import test from "node:test";
import assert from "node:assert/strict";

import {
  loadBobSnapshotFromLocalBridge,
  runBobLocalAction,
} from "../../lib/bob/local-bridge";

test("loadBobSnapshotFromLocalBridge builds a normalized live Bob snapshot", async () => {
  const snapshot = await loadBobSnapshotFromLocalBridge(
    {
      containerName: "openclaw-openclaw-gateway-1",
      cronPath: "/cron/jobs.json",
      healthUrl: "http://127.0.0.1:18789/healthz",
      modelsPath: "/agent/models.json",
      openclawConfigPath: "/openclaw.json",
    },
    {
      execFile: async (command, args) => {
        const joined = [command, ...args].join(" ");
        if (joined.includes("node -p")) {
          return { code: 0, stdout: "2026.3.12\n" };
        }
        if (joined.includes("ls -1 /app/scripts/bob-models")) {
          return { code: 0, stdout: "" };
        }
        throw new Error(`unexpected exec call: ${joined}`);
      },
      fetch: async () =>
        new Response(JSON.stringify({ ok: true, status: "live" }), {
          headers: { "content-type": "application/json" },
          status: 200,
        }),
      readFile: async (path) => {
        if (path === "/agent/models.json") {
          return JSON.stringify({
            providers: {
              "openai-codex": {
                baseUrl: "https://gemini-proxi.vercel.app/codex",
              },
            },
          });
        }
        if (path === "/openclaw.json") {
          return JSON.stringify({
            agents: {
              defaults: {
                model: {
                  fallbacks: ["google/gemini-2.5-flash"],
                  primary: "openai-codex/gpt-5.3-codex",
                },
              },
            },
          });
        }
        if (path === "/cron/jobs.json") {
          return JSON.stringify({
            jobs: [
              {
                id: "ai-radar",
                name: "AI Radar",
                state: { consecutiveErrors: 0, lastRunAt: "2026-03-14T10:00:00Z" },
              },
            ],
          });
        }
        throw new Error(`unexpected readFile path: ${path}`);
      },
    },
  );

  assert.equal(snapshot.system.health, "healthy");
  assert.equal(snapshot.system.version, "2026.3.12");
  assert.equal(snapshot.models.primary, "openai-codex/gpt-5.3-codex");
  assert.equal(snapshot.diagnostics.scriptsPresent, true);
  assert.equal(snapshot.cron[0]?.id, "ai-radar");
});

test("runBobLocalAction executes model diagnostics without exposing generic exec", async () => {
  const result = await runBobLocalAction(
    {
      containerName: "openclaw-openclaw-gateway-1",
    },
    {
      actionId: "run-model-diagnostics",
      execFile: async (command, args) => {
        assert.equal(command, "docker");
        assert.deepEqual(args, [
          "exec",
          "openclaw-openclaw-gateway-1",
          "python3",
          "/app/scripts/bob-models",
          "--hours",
          "6",
        ]);
        return {
          code: 0,
          stdout: "Primary: gpt-5.3-codex\nFallback: gemini-2.5-flash\n",
        };
      },
    },
  );

  assert.equal(result.ok, true);
  assert.equal(result.status, 200);
  assert.match(String(result.data), /gpt-5\.3-codex/);
});
