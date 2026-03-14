import test from "node:test";
import assert from "node:assert/strict";

import {
  getActionDefinition,
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
