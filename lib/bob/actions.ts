import type { BobRisk } from "./types";
import type { BobUiConfig } from "./config";

type BobActionDefinition = {
  id: string;
  label: string;
  payloadShape: "none" | "job";
  risk: BobRisk;
};

type ValidateActionRequestArgs = {
  actionId: string;
  payload: Record<string, unknown>;
};

type ValidateActionRequestResult =
  | {
      ok: true;
      action: BobActionDefinition;
      payload: Record<string, string>;
    }
  | { ok: false; reason: "invalid_payload" | "unknown_action" };

type ExecuteBobActionArgs = {
  actionId: string;
  config: BobUiConfig;
  payload: Record<string, unknown>;
  userId: string;
};

type ExecuteBobActionResult = {
  action: BobActionDefinition;
  data: unknown;
  ok: boolean;
  status: number;
};

const ACTIONS: Record<string, BobActionDefinition> = {
  "pause-cron": {
    id: "pause-cron",
    label: "Pause cron",
    payloadShape: "job",
    risk: "state-changing",
  },
  "refresh-dashboard": {
    id: "refresh-dashboard",
    label: "Refresh dashboard",
    payloadShape: "none",
    risk: "safe-read",
  },
  "restart-gateway": {
    id: "restart-gateway",
    label: "Restart gateway",
    payloadShape: "none",
    risk: "state-changing",
  },
  "resume-cron": {
    id: "resume-cron",
    label: "Resume cron",
    payloadShape: "job",
    risk: "state-changing",
  },
  "run-cron-now": {
    id: "run-cron-now",
    label: "Run cron now",
    payloadShape: "job",
    risk: "state-changing",
  },
  "run-model-diagnostics": {
    id: "run-model-diagnostics",
    label: "Run model diagnostics",
    payloadShape: "none",
    risk: "safe-read",
  },
  "run-radar": {
    id: "run-radar",
    label: "Run radar",
    payloadShape: "none",
    risk: "safe-read",
  },
};

export function getActionDefinition(actionId: string) {
  return ACTIONS[actionId] ?? null;
}

export function validateActionRequest({
  actionId,
  payload,
}: ValidateActionRequestArgs): ValidateActionRequestResult {
  const action = getActionDefinition(actionId);
  if (!action) {
    return { ok: false, reason: "unknown_action" };
  }

  if (action.payloadShape === "none") {
    return {
      action,
      ok: true,
      payload: {},
    };
  }

  const jobId = payload.jobId;
  if (typeof jobId !== "string" || jobId.trim().length === 0) {
    return { ok: false, reason: "invalid_payload" };
  }

  return {
    action,
    ok: true,
    payload: { jobId: jobId.trim() },
  };
}

export async function executeBobAction({
  actionId,
  config,
  payload,
  userId,
}: ExecuteBobActionArgs): Promise<ExecuteBobActionResult> {
  const validated = validateActionRequest({ actionId, payload });
  if (!validated.ok) {
    return {
      action: {
        id: actionId,
        label: actionId,
        payloadShape: "none",
        risk: "destructive",
      },
      data: { error: validated.reason },
      ok: false,
      status: validated.reason === "unknown_action" ? 404 : 400,
    };
  }

  if (validated.action.id === "refresh-dashboard") {
    return {
      action: validated.action,
      data: { message: "Dashboard refresh requested." },
      ok: true,
      status: 200,
    };
  }

  if (!config.actionBaseUrl) {
    return {
      action: validated.action,
      data: { error: "action_bridge_not_configured" },
      ok: false,
      status: 501,
    };
  }

  const target = new URL(
    `${config.actionBaseUrl.replace(/\/$/, "")}/${validated.action.id}`,
  );
  const headers = new Headers({ "content-type": "application/json" });
  if (config.actionBearerToken) {
    headers.set("authorization", `Bearer ${config.actionBearerToken}`);
  }

  const response = await fetch(target, {
    body: JSON.stringify({
      actionId: validated.action.id,
      payload: validated.payload,
      requestedAt: new Date().toISOString(),
      requestedBy: userId,
      risk: validated.action.risk,
    }),
    headers,
    method: "POST",
  });

  const contentType = response.headers.get("content-type") ?? "";
  const data = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  return {
    action: validated.action,
    data,
    ok: response.ok,
    status: response.status,
  };
}
