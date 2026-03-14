import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

import { validateTelegramInitData } from "../../lib/bob/telegram-auth";

function signTelegramInitData(botToken: string, fields: Record<string, string>) {
  const dataCheckString = Object.entries(fields)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secret = crypto
    .createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();

  const hash = crypto
    .createHmac("sha256", secret)
    .update(dataCheckString)
    .digest("hex");

  return new URLSearchParams({ ...fields, hash }).toString();
}

test("validateTelegramInitData accepts a valid owner Telegram WebApp payload", () => {
  const botToken = "123456:telegram-bot-token";
  const rawInitData = signTelegramInitData(botToken, {
    auth_date: "1710400000",
    query_id: "AAHdF6IQAAAAAN0XohDhrOrc",
    user: JSON.stringify({
      id: 156025744,
      first_name: "Ilya",
      username: "bobmark",
      language_code: "ru",
    }),
  });

  const result = validateTelegramInitData({
    allowedUserIds: ["156025744"],
    botToken,
    maxAgeSeconds: 86400,
    nowMs: 1710400000 * 1000,
    rawInitData,
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail(`expected valid owner auth, got ${result.reason}`);
  }
  assert.equal(result.user.id, "156025744");
  assert.equal(result.user.username, "bobmark");
});

test("validateTelegramInitData rejects tampered hashes", () => {
  const botToken = "123456:telegram-bot-token";
  const rawInitData = signTelegramInitData(botToken, {
    auth_date: "1710400000",
    query_id: "AAHdF6IQAAAAAN0XohDhrOrc",
    user: JSON.stringify({
      id: 156025744,
      first_name: "Ilya",
      username: "bobmark",
    }),
  }).replace("bobmark", "mallory");

  const result = validateTelegramInitData({
    allowedUserIds: ["156025744"],
    botToken,
    maxAgeSeconds: 86400,
    nowMs: 1710400000 * 1000,
    rawInitData,
  });

  assert.deepEqual(result, { ok: false, reason: "invalid_hash" });
});
