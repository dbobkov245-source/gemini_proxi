import test from "node:test";
import assert from "node:assert/strict";

import {
  getActionDefinition,
  getAvailableActionIds,
  validateActionRequest,
} from "../../lib/bob/actions";

test("getActionDefinition exposes only allowlisted Bob wrapper actions", () => {
  assert.equal(getActionDefinition("run-model-diagnostics")?.risk, "safe-read");
  assert.equal(getActionDefinition("restart-gateway")?.risk, "state-changing");
  assert.equal(getActionDefinition("exec"), null);
});

test("validateActionRequest rejects missing payload for cron actions", () => {
  const result = validateActionRequest({
    actionId: "pause-cron",
    payload: {},
  });

  assert.deepEqual(result, {
    ok: false,
    reason: "invalid_payload",
  });
});

test("validateActionRequest accepts a valid run-cron-now request", () => {
  const result = validateActionRequest({
    actionId: "run-cron-now",
    payload: { jobId: "ai-radar" },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail(`expected valid action request, got ${result.reason}`);
  }
  assert.equal(result.action.id, "run-cron-now");
});

test("getAvailableActionIds only exposes explicitly configured remote actions", () => {
  const ids = getAvailableActionIds({
    actionBaseUrl: "https://example.com/bob/actions",
    actionBearerToken: "secret",
    actionIds: ["run-model-diagnostics", "exec", "run-radar"],
    allowedUserIds: [],
    botToken: null,
    localContainerName: "openclaw-openclaw-gateway-1",
    localCronPath: "/home/devops/.openclaw/cron/jobs.json",
    localHealthUrl: "http://127.0.0.1:18789/healthz",
    localModelsPath: "/home/devops/.openclaw/agents/main/agent/models.json",
    localOpenclawConfigPath: "/home/devops/.openclaw/openclaw.json",
    sessionSecret: "secret",
    sessionTtlSeconds: 900,
    snapshotBearerToken: null,
    snapshotPath: null,
    snapshotSource: "url",
    snapshotUrl: "https://example.com/bob/snapshot",
  });

  assert.deepEqual([...ids].sort(), ["run-model-diagnostics", "run-radar"]);
});

test("getAvailableActionIds defaults remote bridge mode to the safe diagnostics action", () => {
  const ids = getAvailableActionIds({
    actionBaseUrl: "https://example.com/bob/actions",
    actionBearerToken: "secret",
    actionIds: [],
    allowedUserIds: [],
    botToken: null,
    localContainerName: "openclaw-openclaw-gateway-1",
    localCronPath: "/home/devops/.openclaw/cron/jobs.json",
    localHealthUrl: "http://127.0.0.1:18789/healthz",
    localModelsPath: "/home/devops/.openclaw/agents/main/agent/models.json",
    localOpenclawConfigPath: "/home/devops/.openclaw/openclaw.json",
    sessionSecret: "secret",
    sessionTtlSeconds: 900,
    snapshotBearerToken: null,
    snapshotPath: null,
    snapshotSource: "url",
    snapshotUrl: "https://example.com/bob/snapshot",
  });

  assert.deepEqual([...ids], ["run-model-diagnostics"]);
});
