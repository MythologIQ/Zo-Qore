import { QoreUiShellServer } from "./server";

async function main(): Promise<void> {
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
  console.log(`failsafe-qore standalone ui listening on ${address.host}:${address.port}`);
  console.log(`runtime source: ${runtimeBaseUrl}`);
}

void main().catch((error) => {
  console.error("failed to start failsafe-qore standalone ui", error);
  process.exit(1);
});
