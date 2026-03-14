export type BobRisk = "safe-read" | "state-changing" | "destructive";

export type BobUser = {
  id: string;
  username?: string;
  firstName?: string;
};

export type BobAlert = {
  id: string;
  level: string;
  message: string;
};

export type BobCronJob = {
  id: string;
  label: string;
  status: string;
};

export type BobReport = {
  id: string;
  label: string;
  summary: string;
};

export type BobSnapshot = {
  alerts: BobAlert[];
  cron: BobCronJob[];
  diagnostics: {
    codexBaseUrl: string;
    scriptsPresent: boolean;
  };
  models: {
    computeToday: string;
    fallbacks: string[];
    primary: string;
  };
  reports: BobReport[];
  system: {
    health: string;
    version: string;
  };
};

export type BobSurfaceAction = {
  id: string;
  label: string;
  risk: BobRisk;
  payload?: Record<string, string>;
};

export type BobSurfaceCard = {
  title: string;
  tone?: string;
  rows?: Array<{ label: string; value: string }>;
  actions?: BobSurfaceAction[];
};

export type BobSurfaceSection = {
  id: string;
  title: string;
  cards: BobSurfaceCard[];
};

export type BobSurface = {
  kind: "surface";
  layout: "single-column";
  sections: BobSurfaceSection[];
};
