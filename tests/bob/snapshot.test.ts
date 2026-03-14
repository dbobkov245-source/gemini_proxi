import test from "node:test";
import assert from "node:assert/strict";

import { normalizeBobSnapshot } from "../../lib/bob/snapshot";
import { buildBobSurface } from "../../lib/bob/surfaces";

test("normalizeBobSnapshot strips secrets and preserves the allowed dashboard fields", () => {
  const normalized = normalizeBobSnapshot({
    alerts: [{ id: "alert-1", level: "warning", message: "Cron lagging" }],
    cron: [{ id: "ai-radar", label: "AI Radar", status: "ok" }],
    diagnostics: {
      codexBaseUrl: "https://gemini-proxi.vercel.app/codex",
      scriptsPresent: true,
    },
    models: {
      computeToday: "1.8M",
      fallbacks: ["google/gemini-2.5-flash"],
      primary: "openai-codex/gpt-5.3-codex",
    },
    secrets: {
      gatewayToken: "should-not-leak",
    },
    system: {
      health: "healthy",
      version: "2026.3.12",
    },
    unknownBlob: {
      nested: true,
    },
  });

  assert.equal("secrets" in normalized, false);
  assert.equal("unknownBlob" in normalized, false);
  assert.equal(normalized.system.health, "healthy");
});

test("buildBobSurface renders a mobile-first surface contract", () => {
  const surface = buildBobSurface(
    normalizeBobSnapshot({
      alerts: [],
      cron: [{ id: "ai-radar", label: "AI Radar", status: "ok" }],
      diagnostics: {
        codexBaseUrl: "https://gemini-proxi.vercel.app/codex",
        scriptsPresent: true,
      },
      models: {
        computeToday: "1.8M",
        fallbacks: ["google/gemini-2.5-flash"],
        primary: "openai-codex/gpt-5.3-codex",
      },
      reports: [{ id: "radar", label: "AI Radar", summary: "No urgent issues" }],
      system: {
        health: "healthy",
        version: "2026.3.12",
      },
    }),
    { availableActions: new Set(["run-model-diagnostics"]) },
  );

  assert.equal(surface.kind, "surface");
  assert.equal(surface.layout, "single-column");
  assert.ok(surface.sections.length >= 3);
  assert.equal(surface.sections[0]?.cards[0]?.title, "System");
  assert.equal(surface.sections[1]?.cards[0]?.actions?.[0]?.id, "run-model-diagnostics");
  assert.equal(surface.sections[2]?.cards[0]?.actions?.length ?? 0, 0);
});
