import type { BobSnapshot, BobSurface } from "./types";

type BuildBobSurfaceOptions = {
  availableActions?: Set<string>;
};

function maybeActions<T extends { id: string }>(
  actions: T[],
  availableActions: Set<string>,
): T[] | undefined {
  const filtered = actions.filter((action) => availableActions.has(action.id));
  return filtered.length > 0 ? filtered : undefined;
}

export function buildBobSurface(
  snapshot: BobSnapshot,
  options: BuildBobSurfaceOptions = {},
): BobSurface {
  const availableActions = options.availableActions ?? new Set<string>();

  return {
    kind: "surface",
    layout: "single-column",
    sections: [
      {
        cards: [
          {
            rows: [
              { label: "Health", value: snapshot.system.health },
              { label: "Version", value: snapshot.system.version },
            ],
            title: "System",
            tone: snapshot.system.health === "healthy" ? "good" : "warning",
          },
        ],
        id: "system",
        title: "System",
      },
      {
        cards: [
          {
            actions: maybeActions(
              [
                {
                  id: "run-model-diagnostics",
                  label: "Run diagnostics",
                  risk: "safe-read",
                },
              ],
              availableActions,
            ),
            rows: [
              { label: "Primary", value: snapshot.models.primary },
              { label: "Compute today", value: snapshot.models.computeToday },
              {
                label: "Codex route",
                value: snapshot.diagnostics.codexBaseUrl,
              },
            ],
            title: "Models",
          },
        ],
        id: "models",
        title: "Models",
      },
      {
        cards: [
          {
            actions: maybeActions(
              [
                { id: "ha-vacuum-start", label: "▶ Start", risk: "state-changing" as const },
                { id: "ha-vacuum-stop",  label: "⏹ Stop",  risk: "state-changing" as const },
                { id: "ha-vacuum-dock",  label: "🏠 Dock",  risk: "state-changing" as const },
              ],
              availableActions,
            ),
            rows: [
              { label: "State",   value: snapshot.ha.vacuum.state },
              { label: "Battery", value: `${snapshot.ha.vacuum.battery}%` },
            ],
            title: "Shustrik",
            tone: snapshot.ha.vacuum.state === "error" ? "warning" : undefined,
          },
          {
            actions: maybeActions(
              [
                { id: "ha-polk-say",         label: "🔊 Say",  risk: "state-changing" as const },
                { id: "ha-polk-volume-down", label: "🔉 −10",  risk: "state-changing" as const },
                { id: "ha-polk-volume-up",   label: "🔊 +10",  risk: "state-changing" as const },
              ],
              availableActions,
            ),
            rows: [
              { label: "State",  value: snapshot.ha.polk.state },
              { label: "Volume", value: `${snapshot.ha.polk.volume}%` },
              ...(snapshot.ha.polk.mediaTitle
                ? [{ label: "Playing", value: snapshot.ha.polk.mediaTitle }]
                : []),
            ],
            title: "Polk",
          },
        ],
        id: "home",
        title: "Home",
      },
      {
        cards: snapshot.cron.map((job) => ({
          actions: maybeActions(
            [
              {
                id: "run-cron-now",
                label: "Run now",
                payload: { jobId: job.id },
                risk: "state-changing",
              },
            ],
            availableActions,
          ),
          rows: [{ label: "Status", value: job.status }],
          title: job.label,
        })),
        id: "cron",
        title: "Cron",
      },
      {
        cards: snapshot.reports.map((report) => ({
          rows: [{ label: "Summary", value: report.summary }],
          title: report.label,
        })),
        id: "reports",
        title: "Reports",
      },
    ],
  };
}
