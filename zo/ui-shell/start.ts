import { QoreUiShellServer } from "./server";

async function main(): Promise<void> {
  process.on("unhandledRejection", (reason) => {
    console.error("[QoreUiShell] Unhandled rejection:", reason);
  });
  process.on("uncaughtException", (err) => {
    console.error("[QoreUiShell] Uncaught exception:", err);
  });

  const host = process.env.QORE_UI_HOST ?? "127.0.0.1";
  const port = Number(process.env.QORE_UI_PORT ?? "9380");
  const runtimeBaseUrl =
    process.env.QORE_RUNTIME_BASE_URL ??
    `http://127.0.0.1:${process.env.QORE_API_PORT ?? "7777"}`;
  const runtimeApiKey = process.env.QORE_API_KEY;
  const requestTimeoutMs = Number(process.env.QORE_UI_TIMEOUT_MS ?? "5000");

  const ui = new QoreUiShellServer({
    host,
    port,
    runtimeBaseUrl,
    runtimeApiKey,
    requestTimeoutMs,
  });

  await ui.start();
  const address = ui.getAddress();
  console.log(`zo-qore standalone ui listening on ${address.host}:${address.port}`);
  console.log(`runtime source: ${runtimeBaseUrl}`);

  // Graceful shutdown: checkpoint DuckDB before exit
  const shutdown = async () => {
    console.log("[QoreUiShell] Shutting down...");
    await ui.stop();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

void main().catch((error) => {
  console.error("failed to start zo-qore standalone ui", error);
  process.exit(1);
});
