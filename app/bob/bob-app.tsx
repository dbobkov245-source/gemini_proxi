"use client";

import { startTransition, useEffect, useState } from "react";

import "./bob-app.css";

type SurfaceAction = {
  id: string;
  label: string;
  payload?: Record<string, string>;
  risk: string;
};

type SurfaceCard = {
  actions?: SurfaceAction[];
  rows?: Array<{ label: string; value: string }>;
  title: string;
  tone?: string;
};

type SurfaceSection = {
  cards: SurfaceCard[];
  id: string;
  title: string;
};

type Surface = {
  kind: "surface";
  layout: "single-column";
  sections: SurfaceSection[];
};

type AppState = {
  error: string | null;
  mode: "boot" | "demo" | "live";
  note: string | null;
  surface: Surface | null;
};

type TelegramWebApp = {
  expand?: () => void;
  initData?: string;
  ready?: () => void;
};

declare global {
  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp;
    };
  }
}

async function parseJsonResponse(response: Response) {
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.error ?? "request_failed");
  }
  return body;
}

export default function BobApp() {
  const [state, setState] = useState<AppState>({
    error: null,
    mode: "boot",
    note: "Opening Bob panel…",
    surface: null,
  });
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      const webApp = window.Telegram?.WebApp;
      webApp?.ready?.();
      webApp?.expand?.();

      try {
        if (webApp?.initData?.trim()) {
          await parseJsonResponse(
            await fetch("/api/bob/session", {
              body: JSON.stringify({ initData: webApp.initData }),
              headers: { "content-type": "application/json" },
              method: "POST",
            }),
          );

          const dashboard = await parseJsonResponse(
            await fetch("/api/bob/dashboard", { cache: "no-store" }),
          );

          if (!cancelled) {
            setState({
              error: null,
              mode: "live",
              note: "Live Telegram session",
              surface: dashboard.surface,
            });
          }
          return;
        }

        const dashboard = await parseJsonResponse(
          await fetch("/api/bob/dashboard?demo=1", { cache: "no-store" }),
        );

        if (!cancelled) {
          setState({
            error: null,
            mode: "demo",
            note: "Demo mode outside Telegram",
            surface: dashboard.surface,
          });
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to open Bob panel";
        if (!cancelled) {
          setState({
            error: message,
            mode: "demo",
            note: "The panel could not establish a live session.",
            surface: null,
          });
        }
      }
    }

    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

  async function refreshDashboard() {
    const url = state.mode === "demo" ? "/api/bob/dashboard?demo=1" : "/api/bob/dashboard";
    const dashboard = await parseJsonResponse(
      await fetch(url, { cache: "no-store" }),
    );
    setState((current) => ({
      ...current,
      error: null,
      surface: dashboard.surface,
    }));
  }

  function handleAction(action: SurfaceAction) {
    if (state.mode === "demo") {
      setState((current) => ({
        ...current,
        error: "Actions are disabled in demo mode.",
      }));
      return;
    }

    setPendingActionId(action.id);
    startTransition(() => {
      void (async () => {
        try {
          const response = await parseJsonResponse(
            await fetch("/api/bob/actions", {
              body: JSON.stringify({
                actionId: action.id,
                payload: action.payload ?? {},
              }),
              headers: { "content-type": "application/json" },
              method: "POST",
            }),
          );

          setState((current) => ({
            ...current,
            error: null,
            note:
              typeof response.data?.message === "string"
                ? response.data.message
                : `${action.label} completed.`,
          }));
          await refreshDashboard();
        } catch (error) {
          setState((current) => ({
            ...current,
            error:
              error instanceof Error ? error.message : `${action.label} failed`,
          }));
        } finally {
          setPendingActionId(null);
        }
      })();
    });
  }

  return (
    <main className="bob-app-shell">
      <section className="bob-app-header">
        <div>
          <p className="bob-app-kicker">Bob Mini App</p>
          <h1>Bob Ops</h1>
        </div>
        <span className={`bob-app-mode bob-app-mode-${state.mode}`}>
          {state.mode}
        </span>
      </section>

      {state.note ? <p className="bob-app-note">{state.note}</p> : null}
      {state.error ? <p className="bob-app-error">{state.error}</p> : null}

      {!state.surface ? (
        <section className="bob-app-empty">
          <p>Loading the panel…</p>
        </section>
      ) : (
        <div className="bob-app-sections">
          {state.surface.sections.map((section) => (
            <section className="bob-app-section" key={section.id}>
              <header className="bob-app-section-header">
                <h2>{section.title}</h2>
              </header>
              <div className="bob-app-cards">
                {section.cards.map((card, index) => (
                  <article className="bob-app-card" key={`${section.id}-${index}`}>
                    <div className="bob-app-card-head">
                      <h3>{card.title}</h3>
                      {card.tone ? (
                        <span className={`bob-app-tone bob-app-tone-${card.tone}`}>
                          {card.tone}
                        </span>
                      ) : null}
                    </div>
                    {card.rows?.length ? (
                      <dl className="bob-app-rows">
                        {card.rows.map((row) => (
                          <div className="bob-app-row" key={`${card.title}-${row.label}`}>
                            <dt>{row.label}</dt>
                            <dd>{row.value}</dd>
                          </div>
                        ))}
                      </dl>
                    ) : null}
                    {card.actions?.length ? (
                      <div className="bob-app-actions">
                        {card.actions.map((action) => (
                          <button
                            className="bob-app-action"
                            disabled={pendingActionId === action.id}
                            key={`${card.title}-${action.id}`}
                            onClick={() => handleAction(action)}
                            type="button"
                          >
                            {pendingActionId === action.id ? "Working…" : action.label}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
