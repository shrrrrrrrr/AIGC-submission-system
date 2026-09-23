import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { createRuntimeDependencies } from "./runtime.js";

async function main(): Promise<void> {
  const runtime = createRuntimeDependencies();
  try {
    await runtime.ready();
    const app = createApp({ auth: runtime.auth, mfa: runtime.mfa, submissions: runtime.submissions });
    const port = Number(process.env.PORT || 3000);
    if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error("PORT 必须是 1 至 65535 的整数");

    const server = serve({ fetch: app.fetch, hostname: "127.0.0.1", port });
    let shuttingDown = false;
    const shutdown = async (signal: string): Promise<void> => {
      if (shuttingDown) return;
      shuttingDown = true;
      console.info(JSON.stringify({ event: "server_shutdown", signal }));
      server.close();
      await runtime.close();
    };
    process.once("SIGTERM", () => { void shutdown("SIGTERM"); });
    process.once("SIGINT", () => { void shutdown("SIGINT"); });
    console.info(`ChinaVR submission server listening on http://localhost:${port} (mode=${runtime.mode})`);
  } catch (error) {
    await runtime.close();
    throw error;
  }
}

void main().catch((error: unknown) => {
  console.error(JSON.stringify({ event: "server_startup_failed", message: error instanceof Error ? error.message : "unknown error" }));
  process.exitCode = 1;
});
