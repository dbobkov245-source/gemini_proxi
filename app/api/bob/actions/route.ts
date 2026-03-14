import { NextRequest, NextResponse } from "next/server";

import { executeBobAction } from "@/lib/bob/actions";
import { getBobUiConfig } from "@/lib/bob/config";
import { verifyBobSessionToken } from "@/lib/bob/session";

export async function POST(request: NextRequest) {
  const config = getBobUiConfig();
  if (!config.sessionSecret) {
    return NextResponse.json(
      { error: "bob_ui_auth_not_configured" },
      { status: 503 },
    );
  }

  const cookie = request.cookies.get("bob_ui_session")?.value;
  if (!cookie) {
    return NextResponse.json({ error: "missing_session" }, { status: 401 });
  }

  const verified = verifyBobSessionToken({
    nowMs: Date.now(),
    secret: config.sessionSecret,
    token: decodeURIComponent(cookie),
  });
  if (!verified.ok) {
    return NextResponse.json({ error: verified.reason }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const actionId =
    body && typeof body === "object" && typeof (body as Record<string, unknown>).actionId === "string"
      ? ((body as Record<string, unknown>).actionId as string)
      : "";
  const payload =
    body && typeof body === "object" && typeof (body as Record<string, unknown>).payload === "object"
      ? (((body as Record<string, unknown>).payload as Record<string, unknown>) ?? {})
      : {};

  try {
    const result = await executeBobAction({
      actionId,
      config,
      payload,
      userId: verified.session.user.id,
    });

    return NextResponse.json(
      {
        action: result.action,
        data: result.data,
        ok: result.ok,
      },
      { status: result.status },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "action_failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
