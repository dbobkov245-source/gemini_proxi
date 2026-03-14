import test from "node:test";
import assert from "node:assert/strict";

import { handleBobBridgeRequest } from "../../lib/bob/bridge";

function makeConfig() {
  return {
    bearerToken: "bridge-secret",
    host: "127.0.0.1",
    port: 8788,
    supportedActionIds: ["run-model-diagnostics"],
    local: {
      containerName: "openclaw-openclaw-gateway-1",
      cronPath: "/home/devops/.openclaw/cron/jobs.json",
      healthUrl: "http://127.0.0.1:18789/healthz",
      modelsPath: "/home/devops/.openclaw/agents/main/agent/models.json",
      openclawConfigPath: "/home/devops/.openclaw/openclaw.json",
    },
  };
}

test("Bob bridge rejects unauthenticated snapshot requests", async () => {
  const response = await handleBobBridgeRequest(
    {
      bodyText: "",
      headers: new Headers(),
      method: "GET",
      pathname: "/snapshot",
    },
    makeConfig(),
    {
      loadSnapshot: async () => {
        assert.fail("loadSnapshot should not be called without auth");
      },
      runAction: async () => {
        assert.fail("runAction should not be called without auth");
      },
    },
  );

  assert.equal(response.status, 401);
  assert.match(response.bodyText, /missing bearer token/i);
});

test("Bob bridge returns a normalized snapshot for authenticated clients", async () => {
  const response = await handleBobBridgeRequest(
    {
      bodyText: "",
      headers: new Headers({
        authorization: "Bearer bridge-secret",
      }),
      method: "GET",
      pathname: "/snapshot",
    },
    makeConfig(),
    {
      loadSnapshot: async () => ({
        alerts: [],
        cron: [],
        diagnostics: {
          codexBaseUrl: "https://gemini-proxi.vercel.app/codex",
          scriptsPresent: true,
        },
        models: {
          computeToday: "local bridge",
          fallbacks: ["google/gemini-2.5-flash"],
          primary: "openai-codex/gpt-5.3-codex",
        },
        reports: [],
        system: {
          health: "healthy",
          version: "2026.3.12",
        },
      }),
      runAction: async () => {
        assert.fail("runAction should not be called for snapshot requests");
      },
    },
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers["content-type"], "application/json; charset=utf-8");
  assert.equal(JSON.parse(response.bodyText).system.version, "2026.3.12");
});

test("Bob bridge exposes supported actions through capabilities", async () => {
  const response = await handleBobBridgeRequest(
    {
      bodyText: "",
      headers: new Headers({
        authorization: "Bearer bridge-secret",
      }),
      method: "GET",
      pathname: "/capabilities",
    },
    makeConfig(),
    {
      loadSnapshot: async () => {
        assert.fail("loadSnapshot should not be called for capabilities");
      },
      runAction: async () => {
        assert.fail("runAction should not be called for capabilities");
      },
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(response.bodyText), {
    ok: true,
    supportedActionIds: ["run-model-diagnostics"],
  });
});

test("Bob bridge rejects action ids that are not enabled", async () => {
  const response = await handleBobBridgeRequest(
    {
      bodyText: JSON.stringify({ actionId: "restart-gateway", payload: {} }),
      headers: new Headers({
        authorization: "Bearer bridge-secret",
        "content-type": "application/json",
      }),
      method: "POST",
      pathname: "/actions/restart-gateway",
    },
    makeConfig(),
    {
      loadSnapshot: async () => {
        assert.fail("loadSnapshot should not be called for actions");
      },
      runAction: async () => {
        assert.fail("runAction should not be called for disabled actions");
      },
    },
  );

  assert.equal(response.status, 501);
  assert.match(response.bodyText, /action_not_enabled/i);
});

test("Bob bridge executes an allowlisted action", async () => {
  const response = await handleBobBridgeRequest(
    {
      bodyText: JSON.stringify({ actionId: "run-model-diagnostics", payload: {} }),
      headers: new Headers({
        authorization: "Bearer bridge-secret",
        "content-type": "application/json",
      }),
      method: "POST",
      pathname: "/actions/run-model-diagnostics",
    },
    makeConfig(),
    {
      loadSnapshot: async () => {
        assert.fail("loadSnapshot should not be called for actions");
      },
      runAction: async ({ actionId, payload }) => {
        assert.equal(actionId, "run-model-diagnostics");
        assert.deepEqual(payload, {});
        return {
          data: "Primary: gpt-5.3-codex",
          ok: true,
          status: 200,
        };
      },
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(response.bodyText), {
    action: "run-model-diagnostics",
    data: "Primary: gpt-5.3-codex",
    ok: true,
  });
});
