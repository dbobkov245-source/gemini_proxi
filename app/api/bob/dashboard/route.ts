import { NextRequest, NextResponse } from "next/server";

import { getAvailableActionIds } from "@/lib/bob/actions";
import { getBobUiConfig } from "@/lib/bob/config";
import { loadBobSnapshot } from "@/lib/bob/snapshot";
import { buildBobSurface } from "@/lib/bob/surfaces";
import { verifyBobSessionToken } from "@/lib/bob/session";

function unauthorizedResponse(error: string) {
  return NextResponse.json({ error }, { status: 401 });
}

export async function GET(request: NextRequest) {
  const config = getBobUiConfig();
  const demoMode = request.nextUrl.searchParams.get("demo") === "1";

  if (!demoMode) {
    if (!config.sessionSecret) {
      return NextResponse.json(
        { error: "bob_ui_auth_not_configured" },
        { status: 503 },
      );
    }

    const cookie = request.cookies.get("bob_ui_session")?.value;
    if (!cookie) {
      return unauthorizedResponse("missing_session");
    }

    const verified = verifyBobSessionToken({
      nowMs: Date.now(),
      secret: config.sessionSecret,
      token: decodeURIComponent(cookie),
    });

    if (!verified.ok) {
      return unauthorizedResponse(verified.reason);
    }
  }

  try {
    const snapshot = demoMode
      ? await loadBobSnapshot({ ...config, snapshotSource: "demo" })
      : await loadBobSnapshot(config);

    return NextResponse.json({
      mode: demoMode ? "demo" : config.snapshotSource,
      surface: buildBobSurface(snapshot, {
        availableActions: getAvailableActionIds(config, { demoMode }),
      }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "snapshot_load_failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
