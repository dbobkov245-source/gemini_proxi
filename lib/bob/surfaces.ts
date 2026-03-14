import type { BobSnapshot, BobSurface } from "./types";

export function buildBobSurface(snapshot: BobSnapshot): BobSurface {
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
            actions: [
              {
                id: "run-model-diagnostics",
                label: "Run diagnostics",
                risk: "safe-read",
              },
            ],
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
          actions: [
            {
              id: "run-cron-now",
              label: "Run now",
              payload: { jobId: job.id },
              risk: "state-changing",
            },
          ],
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
