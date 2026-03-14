import crypto from "node:crypto";

import type { BobUser } from "./types";

type ValidateTelegramInitDataArgs = {
  allowedUserIds: string[];
  botToken: string;
  maxAgeSeconds: number;
  nowMs: number;
  rawInitData: string;
};

type ValidateTelegramInitDataResult =
  | { ok: true; authDate: number; user: BobUser }
  | {
      ok: false;
      reason:
        | "invalid_hash"
        | "invalid_payload"
        | "forbidden"
        | "missing_hash"
        | "stale_auth";
    };

function normalizeUser(input: unknown): BobUser | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const record = input as Record<string, unknown>;
  if (typeof record.id !== "number" && typeof record.id !== "string") {
    return null;
  }

  return {
    firstName:
      typeof record.first_name === "string" ? record.first_name : undefined,
    id: String(record.id),
    username: typeof record.username === "string" ? record.username : undefined,
  };
}

function createTelegramHash(botToken: string, dataCheckString: string) {
  const secret = crypto
    .createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();

  return crypto
    .createHmac("sha256", secret)
    .update(dataCheckString)
    .digest("hex");
}

export function validateTelegramInitData({
  allowedUserIds,
  botToken,
  maxAgeSeconds,
  nowMs,
  rawInitData,
}: ValidateTelegramInitDataArgs): ValidateTelegramInitDataResult {
  const params = new URLSearchParams(rawInitData);
  const providedHash = params.get("hash");

  if (!providedHash) {
    return { ok: false, reason: "missing_hash" };
  }

  const pairs = Array.from(params.entries()).filter(([key]) => key !== "hash");
  const dataCheckString = pairs
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const expectedHash = createTelegramHash(botToken, dataCheckString);
  const expected = Buffer.from(expectedHash, "hex");
  const actual = Buffer.from(providedHash, "hex");

  if (
    expected.length !== actual.length ||
    !crypto.timingSafeEqual(expected, actual)
  ) {
    return { ok: false, reason: "invalid_hash" };
  }

  const authDate = Number(params.get("auth_date"));
  const userRaw = params.get("user");
  if (!Number.isFinite(authDate) || !userRaw) {
    return { ok: false, reason: "invalid_payload" };
  }

  if (nowMs - authDate * 1000 > maxAgeSeconds * 1000) {
    return { ok: false, reason: "stale_auth" };
  }

  let user: BobUser | null = null;
  try {
    user = normalizeUser(JSON.parse(userRaw));
  } catch {
    return { ok: false, reason: "invalid_payload" };
  }

  if (!user) {
    return { ok: false, reason: "invalid_payload" };
  }

  if (!allowedUserIds.includes(user.id)) {
    return { ok: false, reason: "forbidden" };
  }

  return {
    authDate,
    ok: true,
    user,
  };
}
