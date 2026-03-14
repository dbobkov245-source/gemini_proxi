import test from "node:test";
import assert from "node:assert/strict";

import {
  createBobSessionToken,
  verifyBobSessionToken,
} from "../../lib/bob/session";

test("Bob session tokens round-trip for the owner", () => {
  const token = createBobSessionToken({
    expiresAtMs: 1710403600000,
    issuedAtMs: 1710400000000,
    secret: "bob-ui-session-secret",
    user: {
      id: "156025744",
      username: "bobmark",
    },
  });

  const result = verifyBobSessionToken({
    nowMs: 1710401000000,
    secret: "bob-ui-session-secret",
    token,
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail(`expected valid session, got ${result.reason}`);
  }
  assert.equal(result.session.user.id, "156025744");
});

test("Bob session verification rejects tampered tokens", () => {
  const token = createBobSessionToken({
    expiresAtMs: 1710403600000,
    issuedAtMs: 1710400000000,
    secret: "bob-ui-session-secret",
    user: {
      id: "156025744",
      username: "bobmark",
    },
  });

  const tampered = token.replace("bobmark", "mallory");

  const result = verifyBobSessionToken({
    nowMs: 1710401000000,
    secret: "bob-ui-session-secret",
    token: tampered,
  });

  assert.deepEqual(result, { ok: false, reason: "invalid_signature" });
});
