import * as http from "http";
import { afterEach, describe, expect, it } from "vitest";
import { McpForwarder, UpstreamHttpError, UpstreamProtocolError } from "../zo/mcp-proxy/forwarder";

const servers: http.Server[] = [];

afterEach(async () => {
  while (servers.length > 0) {
    const server = servers.pop();
    if (!server) continue;
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
});

async function startServer(handler: (req: http.IncomingMessage, res: http.ServerResponse) => void): Promise<string> {
  const server = http.createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("server address unavailable");
  return `http://${address.address}:${address.port}`;
}

describe("McpForwarder", () => {
  it("throws UpstreamHttpError on non-2xx response", async () => {
    const url = await startServer((_req, res) => {
      res.statusCode = 503;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: "down" }));
    });
    const forwarder = new McpForwarder({ upstreamUrl: url, timeoutMs: 1000, maxReadRetries: 0 });
    await expect(
      forwarder.forward(
        {
          jsonrpc: "2.0",
          id: "x",
          method: "tools/list",
        },
        false,
      ),
    ).rejects.toBeInstanceOf(UpstreamHttpError);
  });

  it("throws UpstreamProtocolError on malformed JSON-RPC response", async () => {
    const url = await startServer((_req, res) => {
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ hello: "world" }));
    });
    const forwarder = new McpForwarder({ upstreamUrl: url, timeoutMs: 1000, maxReadRetries: 0 });
    await expect(
      forwarder.forward(
        {
          jsonrpc: "2.0",
          id: "x",
          method: "tools/list",
        },
        false,
      ),
    ).rejects.toBeInstanceOf(UpstreamProtocolError);
  });
});
