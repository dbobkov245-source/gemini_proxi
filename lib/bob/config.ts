export type BobUiConfig = {
  actionBaseUrl: string | null;
  actionBearerToken: string | null;
  allowedUserIds: string[];
  botToken: string | null;
  sessionSecret: string | null;
  sessionTtlSeconds: number;
  snapshotBearerToken: string | null;
  snapshotPath: string | null;
  snapshotSource: "demo" | "file" | "url";
  snapshotUrl: string | null;
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
    env.BOB_UI_SNAPSHOT_SOURCE === "file" || env.BOB_UI_SNAPSHOT_SOURCE === "url"
      ? env.BOB_UI_SNAPSHOT_SOURCE
      : "demo";

  return {
    actionBaseUrl: env.BOB_UI_ACTION_BASE_URL?.trim() || null,
    actionBearerToken: env.BOB_UI_ACTION_BEARER_TOKEN?.trim() || null,
    allowedUserIds: parseCsv(env.BOB_UI_ALLOWED_USER_IDS),
    botToken: env.BOB_UI_BOT_TOKEN?.trim() || null,
    sessionSecret: env.BOB_UI_SESSION_SECRET?.trim() || null,
    sessionTtlSeconds: parsePositiveInt(env.BOB_UI_SESSION_TTL_SECONDS, 900),
    snapshotBearerToken: env.BOB_UI_SNAPSHOT_BEARER_TOKEN?.trim() || null,
    snapshotPath: env.BOB_UI_SNAPSHOT_PATH?.trim() || null,
    snapshotSource,
    snapshotUrl: env.BOB_UI_SNAPSHOT_URL?.trim() || null,
  };
}
