import { getBobBridgeConfig } from "../lib/bob/config";
import { createBobBridgeServer } from "../lib/bob/bridge";

async function main() {
  const config = getBobBridgeConfig();
  if (!config.bearerToken) {
    throw new Error("BOB_BRIDGE_BEARER_TOKEN is required");
  }

  const server = createBobBridgeServer(config);

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.port, config.host, () => resolve());
  });

  console.log(
    `Bob bridge listening on http://${config.host}:${config.port} with actions: ${
      config.supportedActionIds.join(",") || "run-model-diagnostics"
    }`,
  );

  const shutdown = () => {
    server.close(() => process.exit(0));
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

void main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Failed to start Bob bridge",
  );
  process.exit(1);
});
