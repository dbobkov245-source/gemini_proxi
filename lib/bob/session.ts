import crypto from "node:crypto";

import type { BobUser } from "./types";

type SessionPayload = {
  expiresAtMs: number;
  issuedAtMs: number;
  user: BobUser;
};

type CreateBobSessionTokenArgs = SessionPayload & {
  secret: string;
};

type VerifyBobSessionTokenArgs = {
  nowMs: number;
  secret: string;
  token: string;
};

type VerifyBobSessionTokenResult =
  | { ok: true; session: SessionPayload }
  | { ok: false; reason: "expired" | "invalid_payload" | "invalid_signature" };

function signPayload(secret: string, payload: string) {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

export function createBobSessionToken({
  expiresAtMs,
  issuedAtMs,
  secret,
  user,
}: CreateBobSessionTokenArgs) {
  const payload = JSON.stringify({
    expiresAtMs,
    issuedAtMs,
    user,
  });
  const signature = signPayload(secret, payload);
  return `${payload}.${signature}`;
}

export function verifyBobSessionToken({
  nowMs,
  secret,
  token,
}: VerifyBobSessionTokenArgs): VerifyBobSessionTokenResult {
  const splitIndex = token.lastIndexOf(".");
  if (splitIndex <= 0) {
    return { ok: false, reason: "invalid_payload" };
  }

  const payload = token.slice(0, splitIndex);
  const providedSignature = token.slice(splitIndex + 1);
  const expectedSignature = signPayload(secret, payload);
  const expected = Buffer.from(expectedSignature, "hex");
  const actual = Buffer.from(providedSignature, "hex");

  if (
    expected.length !== actual.length ||
    !crypto.timingSafeEqual(expected, actual)
  ) {
    return { ok: false, reason: "invalid_signature" };
  }

  let parsed: SessionPayload;
  try {
    parsed = JSON.parse(payload) as SessionPayload;
  } catch {
    return { ok: false, reason: "invalid_payload" };
  }

  if (
    !parsed ||
    typeof parsed.expiresAtMs !== "number" ||
    typeof parsed.issuedAtMs !== "number" ||
    !parsed.user ||
    typeof parsed.user.id !== "string"
  ) {
    return { ok: false, reason: "invalid_payload" };
  }

  if (nowMs > parsed.expiresAtMs) {
    return { ok: false, reason: "expired" };
  }

  return {
    ok: true,
    session: parsed,
  };
}
