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
