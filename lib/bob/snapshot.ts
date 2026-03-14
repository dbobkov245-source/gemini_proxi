import { readFile } from "node:fs/promises";

import type { BobAlert, BobCronJob, BobReport, BobSnapshot } from "./types";
import type { BobUiConfig } from "./config";
import { loadBobSnapshotFromLocalBridge } from "./local-bridge";

function normalizeAlert(input: unknown): BobAlert | null {
  if (!input || typeof input !== "object") {
    return null;
  }
  const record = input as Record<string, unknown>;
  if (
    typeof record.id !== "string" ||
    typeof record.level !== "string" ||
    typeof record.message !== "string"
  ) {
    return null;
  }
  return {
    id: record.id,
    level: record.level,
    message: record.message,
  };
}

function normalizeCron(input: unknown): BobCronJob | null {
  if (!input || typeof input !== "object") {
    return null;
  }
  const record = input as Record<string, unknown>;
  if (
    typeof record.id !== "string" ||
    typeof record.label !== "string" ||
    typeof record.status !== "string"
  ) {
    return null;
  }
  return {
    id: record.id,
    label: record.label,
    status: record.status,
  };
}

function normalizeReport(input: unknown): BobReport | null {
  if (!input || typeof input !== "object") {
    return null;
  }
  const record = input as Record<string, unknown>;
  if (
    typeof record.id !== "string" ||
    typeof record.label !== "string" ||
    typeof record.summary !== "string"
  ) {
    return null;
  }
  return {
    id: record.id,
    label: record.label,
    summary: record.summary,
  };
}

export function normalizeBobSnapshot(input: unknown): BobSnapshot {
  const record = input && typeof input === "object"
    ? (input as Record<string, unknown>)
    : {};

  const alerts = Array.isArray(record.alerts)
    ? record.alerts
        .map(normalizeAlert)
        .filter((value): value is BobAlert => value !== null)
    : [];

  const cron = Array.isArray(record.cron)
    ? record.cron
        .map(normalizeCron)
        .filter((value): value is BobCronJob => value !== null)
    : [];

  const reports = Array.isArray(record.reports)
    ? record.reports
        .map(normalizeReport)
        .filter((value): value is BobReport => value !== null)
    : [];

  const diagnostics =
    record.diagnostics && typeof record.diagnostics === "object"
      ? (record.diagnostics as Record<string, unknown>)
      : {};

  const models =
    record.models && typeof record.models === "object"
      ? (record.models as Record<string, unknown>)
      : {};

  const system =
    record.system && typeof record.system === "object"
      ? (record.system as Record<string, unknown>)
      : {};

  return {
    alerts,
    cron,
    diagnostics: {
      codexBaseUrl:
        typeof diagnostics.codexBaseUrl === "string"
          ? diagnostics.codexBaseUrl
          : "unknown",
      scriptsPresent: diagnostics.scriptsPresent === true,
    },
    models: {
      computeToday:
        typeof models.computeToday === "string" ? models.computeToday : "n/a",
      fallbacks: Array.isArray(models.fallbacks)
        ? models.fallbacks.filter(
            (value): value is string => typeof value === "string",
          )
        : [],
      primary: typeof models.primary === "string" ? models.primary : "unknown",
    },
    reports,
    system: {
      health: typeof system.health === "string" ? system.health : "unknown",
      version: typeof system.version === "string" ? system.version : "unknown",
    },
  };
}

export const DEMO_BOB_SNAPSHOT: BobSnapshot = normalizeBobSnapshot({
  alerts: [
    {
      id: "alert-ops-1",
      level: "info",
      message: "Demo mode: connect a real snapshot bridge for live data.",
    },
  ],
  cron: [
    { id: "ai-radar", label: "AI Radar", status: "ok" },
    { id: "bob-watch", label: "Bob Watch", status: "ok" },
    { id: "bob-brain", label: "Bob Brain", status: "ok" },
  ],
  diagnostics: {
    codexBaseUrl: "https://gemini-proxi.vercel.app/codex",
    scriptsPresent: true,
  },
  models: {
    computeToday: "1.8M",
    fallbacks: ["google/gemini-2.5-flash", "openrouter/minimax/minimax-m2.5"],
    primary: "openai-codex/gpt-5.3-codex",
  },
  reports: [
    {
      id: "radar",
      label: "AI Radar",
      summary: "No urgent issues in the demo snapshot.",
    },
  ],
  system: {
    health: "healthy",
    version: "2026.3.12",
  },
});

export async function loadBobSnapshot(config: BobUiConfig): Promise<BobSnapshot> {
  if (config.snapshotSource === "local") {
    return loadBobSnapshotFromLocalBridge({
      containerName: config.localContainerName,
      cronPath: config.localCronPath,
      healthUrl: config.localHealthUrl,
      modelsPath: config.localModelsPath,
      openclawConfigPath: config.localOpenclawConfigPath,
    });
  }

  if (config.snapshotSource === "file") {
    if (!config.snapshotPath) {
      throw new Error("BOB_UI_SNAPSHOT_PATH is required for file snapshot mode");
    }
    const content = await readFile(config.snapshotPath, "utf8");
    return normalizeBobSnapshot(JSON.parse(content));
  }

  if (config.snapshotSource === "url") {
    if (!config.snapshotUrl) {
      throw new Error("BOB_UI_SNAPSHOT_URL is required for url snapshot mode");
    }
    const headers = new Headers();
    if (config.snapshotBearerToken) {
      headers.set("authorization", `Bearer ${config.snapshotBearerToken}`);
    }
    const response = await fetch(config.snapshotUrl, {
      headers,
      method: "GET",
      next: { revalidate: 15 },
    });
    if (!response.ok) {
      throw new Error(`Snapshot fetch failed with ${response.status}`);
    }
    return normalizeBobSnapshot(await response.json());
  }

  return DEMO_BOB_SNAPSHOT;
}
