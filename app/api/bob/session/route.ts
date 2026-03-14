import { NextRequest, NextResponse } from "next/server";

import { getBobUiConfig } from "@/lib/bob/config";
import { createBobSessionToken } from "@/lib/bob/session";
import { validateTelegramInitData } from "@/lib/bob/telegram-auth";

function mapAuthError(reason: string) {
  switch (reason) {
    case "forbidden":
      return 403;
    case "invalid_payload":
      return 400;
    case "stale_auth":
      return 401;
    default:
      return 401;
  }
}

export async function POST(request: NextRequest) {
  const config = getBobUiConfig();
  if (!config.botToken || !config.sessionSecret || config.allowedUserIds.length === 0) {
    return NextResponse.json(
      { error: "bob_ui_auth_not_configured" },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const initData =
    body && typeof body === "object" && typeof (body as Record<string, unknown>).initData === "string"
      ? ((body as Record<string, unknown>).initData as string)
      : "";

  const auth = validateTelegramInitData({
    allowedUserIds: config.allowedUserIds,
    botToken: config.botToken,
    maxAgeSeconds: config.sessionTtlSeconds,
    nowMs: Date.now(),
    rawInitData: initData,
  });

  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.reason },
      { status: mapAuthError(auth.reason) },
    );
  }

  const nowMs = Date.now();
  const expiresAtMs = nowMs + config.sessionTtlSeconds * 1000;
  const token = createBobSessionToken({
    expiresAtMs,
    issuedAtMs: nowMs,
    secret: config.sessionSecret,
    user: auth.user,
  });

  const response = NextResponse.json({
    expiresAtMs,
    ok: true,
    user: auth.user,
  });
  response.cookies.set({
    httpOnly: true,
    maxAge: config.sessionTtlSeconds,
    name: "bob_ui_session",
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    value: encodeURIComponent(token),
  });
  return response;
}
