import { timingSafeEqual } from "node:crypto";
import { execFile as nodeExecFile } from "node:child_process";
import { promisify } from "node:util";
import http from "node:http";

import type { BobBridgeConfig } from "./config";
import { validateActionRequest } from "./actions";
import {
  LOCAL_BOB_ACTION_IDS,
  loadBobSnapshotFromLocalBridge,
  runBobLocalAction,
} from "./local-bridge";
import type { BobSnapshot } from "./types";

const execFileAsync = promisify(nodeExecFile);

export type BobBridgeRequest = {
  bodyText: string;
  headers: Headers;
  method: string;
  pathname: string;
};

export type BobBridgeResponse = {
  bodyText: string;
  headers: Record<string, string>;
  status: number;
};

type BobBridgeDeps = {
  loadSnapshot: () => Promise<BobSnapshot>;
  runAction: (args: {
    actionId: string;
    payload: Record<string, unknown>;
  }) => Promise<{ data: unknown; ok: boolean; status: number }>;
};

function createDefaultBridgeDeps(config: BobBridgeConfig): BobBridgeDeps {
  return {
    loadSnapshot: () =>
      loadBobSnapshotFromLocalBridge({
        containerName: config.local.containerName,
        cronPath: config.local.cronPath,
        healthUrl: config.local.healthUrl,
        modelsPath: config.local.modelsPath,
        openclawConfigPath: config.local.openclawConfigPath,
      }),
    runAction: ({ actionId }) =>
      runBobLocalAction(
        { containerName: config.local.containerName },
        {
          actionId,
          execFile: async (command, args) => {
            const result = await execFileAsync(command, args, {
              encoding: "utf8",
            });
            return {
              code: 0,
              stdout: result.stdout,
            };
          },
        },
      ),
  };
}

function jsonResponse(status: number, payload: unknown): BobBridgeResponse {
  return {
    bodyText: JSON.stringify(payload),
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
    },
    status,
  };
}

function extractBearerToken(headers: Headers) {
  const authorization = headers.get("authorization")?.trim() ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? "";
}

function tokensMatch(expected: string, received: string) {
  const expectedBuffer = Buffer.from(expected, "utf8");
  const receivedBuffer = Buffer.from(received, "utf8");
  if (expectedBuffer.length === 0 || expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }
  return timingSafeEqual(expectedBuffer, receivedBuffer);
}

function getEnabledLocalActionIds(config: BobBridgeConfig) {
  const configured =
    config.supportedActionIds.length > 0
      ? config.supportedActionIds
      : LOCAL_BOB_ACTION_IDS;
  return new Set(
    configured.filter((actionId) => LOCAL_BOB_ACTION_IDS.includes(actionId)),
  );
}

function isAuthorized(request: BobBridgeRequest, config: BobBridgeConfig) {
  if (!config.bearerToken) {
    return false;
  }
  return tokensMatch(config.bearerToken, extractBearerToken(request.headers));
}

function methodNotAllowed() {
  return jsonResponse(405, { error: "method_not_allowed" });
}

async function handleActionRequest(
  request: BobBridgeRequest,
  config: BobBridgeConfig,
  deps: BobBridgeDeps,
): Promise<BobBridgeResponse> {
  if (request.method !== "POST") {
    return methodNotAllowed();
  }

  const actionId = request.pathname.slice("/actions/".length).trim();
  const enabledActionIds = getEnabledLocalActionIds(config);
  if (!enabledActionIds.has(actionId)) {
    return jsonResponse(501, { error: "action_not_enabled" });
  }

  let body: unknown;
  try {
    body = request.bodyText.length > 0 ? JSON.parse(request.bodyText) : {};
  } catch {
    return jsonResponse(400, { error: "invalid_json" });
  }

  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  if (typeof record.actionId === "string" && record.actionId !== actionId) {
    return jsonResponse(400, { error: "action_mismatch" });
  }

  const payload =
    record.payload && typeof record.payload === "object"
      ? (record.payload as Record<string, unknown>)
      : {};
  const validated = validateActionRequest({ actionId, payload });
  if (!validated.ok) {
    return jsonResponse(validated.reason === "unknown_action" ? 404 : 400, {
      error: validated.reason,
    });
  }

  const result = await deps.runAction({
    actionId: validated.action.id,
    payload: validated.payload,
  });

  return jsonResponse(result.status, {
    action: validated.action.id,
    data: result.data,
    ok: result.ok,
  });
}

export async function handleBobBridgeRequest(
  request: BobBridgeRequest,
  config: BobBridgeConfig,
  deps: BobBridgeDeps = createDefaultBridgeDeps(config),
): Promise<BobBridgeResponse> {
  if (request.pathname === "/healthz") {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return methodNotAllowed();
    }
    return jsonResponse(200, { ok: true });
  }

  if (!isAuthorized(request, config)) {
    return jsonResponse(401, { error: "missing bearer token" });
  }

  if (request.pathname === "/capabilities") {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return methodNotAllowed();
    }
    return jsonResponse(200, {
      ok: true,
      supportedActionIds: Array.from(getEnabledLocalActionIds(config)),
    });
  }

  if (request.pathname === "/snapshot") {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return methodNotAllowed();
    }
    return jsonResponse(200, await deps.loadSnapshot());
  }

  if (request.pathname.startsWith("/actions/")) {
    return handleActionRequest(request, config, deps);
  }

  return jsonResponse(404, { error: "not_found" });
}

async function readRequestBody(request: http.IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export function createBobBridgeServer(
  config: BobBridgeConfig,
  deps?: BobBridgeDeps,
) {
  return http.createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const bodyText = await readRequestBody(request);
    const bridgeResponse = await handleBobBridgeRequest(
      {
        bodyText,
        headers: new Headers(request.headers as Record<string, string>),
        method: request.method ?? "GET",
        pathname: url.pathname,
      },
      config,
      deps,
    );

    response.statusCode = bridgeResponse.status;
    for (const [key, value] of Object.entries(bridgeResponse.headers)) {
      response.setHeader(key, value);
    }
    response.end(request.method === "HEAD" ? "" : bridgeResponse.bodyText);
  });
}
