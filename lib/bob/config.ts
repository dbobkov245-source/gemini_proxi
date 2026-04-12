export type BobUiConfig = {
  actionBaseUrl: string | null;
  actionBearerToken: string | null;
  actionIds: string[];
  allowedUserIds: string[];
  botToken: string | null;
  initDataMaxAgeSeconds: number;
  localContainerName: string;
  localCronPath: string;
  localHealthUrl: string;
  localModelsPath: string;
  localOpenclawConfigPath: string;
  sessionSecret: string | null;
  sessionTtlSeconds: number;
  snapshotBearerToken: string | null;
  snapshotPath: string | null;
  snapshotSource: "demo" | "file" | "local" | "url";
  snapshotUrl: string | null;
};

export type BobBridgeConfig = {
  bearerToken: string | null;
  host: string;
  local: {
    containerName: string;
    cronPath: string;
    healthUrl: string;
    modelsPath: string;
    openclawConfigPath: string;
  };
  port: number;
  supportedActionIds: string[];
};

function parseCsv(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
}

export function getBobUiConfig(env: NodeJS.ProcessEnv = process.env): BobUiConfig {
  const snapshotSource =
    env.BOB_UI_SNAPSHOT_SOURCE === "file" ||
    env.BOB_UI_SNAPSHOT_SOURCE === "local" ||
    env.BOB_UI_SNAPSHOT_SOURCE === "url"
      ? env.BOB_UI_SNAPSHOT_SOURCE
      : "demo";

  return {
    actionBaseUrl: env.BOB_UI_ACTION_BASE_URL?.trim() || null,
    actionBearerToken: env.BOB_UI_ACTION_BEARER_TOKEN?.trim() || null,
    actionIds: parseCsv(env.BOB_UI_ACTION_IDS),
    allowedUserIds: parseCsv(env.BOB_UI_ALLOWED_USER_IDS),
    botToken: env.BOB_UI_BOT_TOKEN?.trim() || null,
    localContainerName:
      env.BOB_UI_LOCAL_CONTAINER_NAME?.trim() ||
      "openclaw-openclaw-gateway-1",
    localCronPath:
      env.BOB_UI_LOCAL_CRON_PATH?.trim() || "/home/devops/.openclaw/cron/jobs.json",
    localHealthUrl:
      env.BOB_UI_LOCAL_HEALTH_URL?.trim() || "http://127.0.0.1:18789/healthz",
    localModelsPath:
      env.BOB_UI_LOCAL_MODELS_PATH?.trim() ||
      "/home/devops/.openclaw/agents/main/agent/models.json",
    localOpenclawConfigPath:
      env.BOB_UI_LOCAL_OPENCLAW_CONFIG_PATH?.trim() ||
      "/home/devops/.openclaw/openclaw.json",
    initDataMaxAgeSeconds: parsePositiveInt(env.BOB_UI_INIT_DATA_MAX_AGE_SECONDS, 86400),
    sessionSecret: env.BOB_UI_SESSION_SECRET?.trim() || null,
    sessionTtlSeconds: parsePositiveInt(env.BOB_UI_SESSION_TTL_SECONDS, 900),
    snapshotBearerToken: env.BOB_UI_SNAPSHOT_BEARER_TOKEN?.trim() || null,
    snapshotPath: env.BOB_UI_SNAPSHOT_PATH?.trim() || null,
    snapshotSource,
    snapshotUrl: env.BOB_UI_SNAPSHOT_URL?.trim() || null,
  };
}

export function getBobBridgeConfig(env: NodeJS.ProcessEnv = process.env): BobBridgeConfig {
  return {
    bearerToken: env.BOB_BRIDGE_BEARER_TOKEN?.trim() || null,
    host: env.BOB_BRIDGE_HOST?.trim() || "127.0.0.1",
    local: {
      containerName:
        env.BOB_UI_LOCAL_CONTAINER_NAME?.trim() ||
        "openclaw-openclaw-gateway-1",
      cronPath:
        env.BOB_UI_LOCAL_CRON_PATH?.trim() ||
        "/home/devops/.openclaw/cron/jobs.json",
      healthUrl:
        env.BOB_UI_LOCAL_HEALTH_URL?.trim() || "http://127.0.0.1:18789/healthz",
      modelsPath:
        env.BOB_UI_LOCAL_MODELS_PATH?.trim() ||
        "/home/devops/.openclaw/agents/main/agent/models.json",
      openclawConfigPath:
        env.BOB_UI_LOCAL_OPENCLAW_CONFIG_PATH?.trim() ||
        "/home/devops/.openclaw/openclaw.json",
    },
    port: parsePositiveInt(env.BOB_BRIDGE_PORT, 8788),
    supportedActionIds:
      parseCsv(env.BOB_BRIDGE_ACTION_IDS).length > 0
        ? parseCsv(env.BOB_BRIDGE_ACTION_IDS)
        : parseCsv(env.BOB_UI_ACTION_IDS),
  };
}
