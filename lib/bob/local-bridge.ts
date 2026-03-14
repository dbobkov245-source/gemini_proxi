import { execFile as nodeExecFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile as nodeReadFile } from "node:fs/promises";

import { normalizeBobSnapshot } from "./snapshot";
import type { BobSnapshot } from "./types";

export const LOCAL_BOB_ACTION_IDS = ["run-model-diagnostics"];

const execFileAsync = promisify(nodeExecFile);

export type LocalBridgeConfig = {
  containerName: string;
  cronPath: string;
  healthUrl: string;
  modelsPath: string;
  openclawConfigPath: string;
};

type ExecResult = {
  code?: number;
  stdout: string;
};

type LocalBridgeDeps = {
  execFile: (command: string, args: string[]) => Promise<ExecResult>;
  fetch: typeof fetch;
  readFile: (path: string, encoding: BufferEncoding) => Promise<string>;
};

type LocalActionDeps = {
  execFile: (command: string, args: string[]) => Promise<ExecResult>;
};

export type LocalActionConfig = {
  containerName: string;
};

function createDefaultDeps(): LocalBridgeDeps {
  return {
    execFile: async (command, args) => {
      const result = await execFileAsync(command, args, { encoding: "utf8" });
      return { stdout: result.stdout };
    },
    fetch,
    readFile: nodeReadFile,
  };
}

function parseCronStatus(job: Record<string, unknown>) {
  const state =
    job.state && typeof job.state === "object"
      ? (job.state as Record<string, unknown>)
      : {};

  const consecutiveErrors =
    typeof state.consecutiveErrors === "number" ? state.consecutiveErrors : 0;
  if (consecutiveErrors >= 2) {
    return "error";
  }
  if (typeof state.lastRunAt === "string" && state.lastRunAt.length > 0) {
    return "ok";
  }
  return "idle";
}

export async function loadBobSnapshotFromLocalBridge(
  config: LocalBridgeConfig,
  deps: LocalBridgeDeps = createDefaultDeps(),
): Promise<BobSnapshot> {
  const [healthResponse, modelsRaw, openclawRaw, cronRaw, versionResult, scriptsResult] =
    await Promise.all([
      deps.fetch(config.healthUrl, { method: "GET" }),
      deps.readFile(config.modelsPath, "utf8"),
      deps.readFile(config.openclawConfigPath, "utf8"),
      deps.readFile(config.cronPath, "utf8"),
      deps.execFile("docker", [
        "exec",
        config.containerName,
        "node",
        "-p",
        "require('/app/package.json').version",
      ]),
      deps.execFile("docker", [
        "exec",
        config.containerName,
        "ls",
        "-1",
        "/app/scripts/bob-models",
        "/app/scripts/bob-models-fix",
        "/app/scripts/bob-compute",
      ]),
    ]);

  const healthJson = (await healthResponse.json()) as Record<string, unknown>;
  const modelsJson = JSON.parse(modelsRaw) as Record<string, unknown>;
  const openclawJson = JSON.parse(openclawRaw) as Record<string, unknown>;
  const cronJson = JSON.parse(cronRaw) as Record<string, unknown>;

  const providers =
    modelsJson.providers && typeof modelsJson.providers === "object"
      ? (modelsJson.providers as Record<string, unknown>)
      : {};
  const codexProvider =
    providers["openai-codex"] && typeof providers["openai-codex"] === "object"
      ? (providers["openai-codex"] as Record<string, unknown>)
      : {};

  const defaults =
    openclawJson.agents &&
    typeof openclawJson.agents === "object" &&
    (openclawJson.agents as Record<string, unknown>).defaults &&
    typeof (openclawJson.agents as Record<string, unknown>).defaults === "object"
      ? ((openclawJson.agents as Record<string, unknown>).defaults as Record<
          string,
          unknown
        >)
      : {};
  const modelDefaults =
    defaults.model && typeof defaults.model === "object"
      ? (defaults.model as Record<string, unknown>)
      : {};

  const jobs = Array.isArray(cronJson.jobs) ? cronJson.jobs : [];

  const snapshot = normalizeBobSnapshot({
    alerts: [],
    cron: jobs
      .filter((job): job is Record<string, unknown> => !!job && typeof job === "object")
      .map((job) => ({
        id: typeof job.id === "string" ? job.id : "unknown-job",
        label:
          typeof job.name === "string"
            ? job.name
            : typeof job.id === "string"
              ? job.id
              : "Unknown job",
        status: parseCronStatus(job),
      })),
    diagnostics: {
      codexBaseUrl:
        typeof codexProvider.baseUrl === "string" ? codexProvider.baseUrl : "unknown",
      scriptsPresent: (scriptsResult.code ?? 0) === 0,
    },
    models: {
      computeToday: "local bridge",
      fallbacks: Array.isArray(modelDefaults.fallbacks)
        ? modelDefaults.fallbacks.filter(
            (value): value is string => typeof value === "string",
          )
        : [],
      primary:
        typeof modelDefaults.primary === "string" ? modelDefaults.primary : "unknown",
    },
    reports: [],
    system: {
      health:
        healthJson.ok === true && healthJson.status === "live"
          ? "healthy"
          : "degraded",
      version: versionResult.stdout.trim() || "unknown",
    },
  });

  const alerts = [...snapshot.alerts];
  if (snapshot.diagnostics.codexBaseUrl !== "https://gemini-proxi.vercel.app/codex") {
    alerts.push({
      id: "codex-route-drift",
      level: "warning",
      message: `Codex route drift: ${snapshot.diagnostics.codexBaseUrl}`,
    });
  }
  if (!snapshot.diagnostics.scriptsPresent) {
    alerts.push({
      id: "diagnostics-missing",
      level: "warning",
      message: "One or more /app/scripts diagnostics tools are missing.",
    });
  }

  return {
    ...snapshot,
    alerts,
  };
}

export async function runBobLocalAction(
  config: LocalActionConfig,
  deps: LocalActionDeps & { actionId: string },
) {
  if (!LOCAL_BOB_ACTION_IDS.includes(deps.actionId)) {
    return {
      data: { error: "action_not_supported_locally" },
      ok: false,
      status: 501,
    };
  }

  const result = await deps.execFile("docker", [
    "exec",
    config.containerName,
    "python3",
    "/app/scripts/bob-models",
    "--hours",
    "6",
  ]);

  return {
    data: result.stdout.trim(),
    ok: true,
    status: 200,
  };
}
