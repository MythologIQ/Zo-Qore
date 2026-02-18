import * as fs from "fs";
import * as path from "path";
import * as http from "http";

export function resolveAssetsDir(override?: string): string {
  const candidates = [
    override ? path.resolve(override) : "",
    process.env.QORE_UI_ASSETS_DIR
      ? path.resolve(process.env.QORE_UI_ASSETS_DIR)
      : "",
    path.resolve(process.cwd(), "zo", "ui-shell", "shared"),
    path.resolve(process.cwd(), "zo", "ui-shell", "assets"),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, "index.html"))) {
      return candidate;
    }
  }
  return path.resolve(process.cwd(), "zo", "ui-shell", "assets");
}

export function hasUiAsset(assetsDir: string, fileName: string): boolean {
  return fs.existsSync(path.join(assetsDir, fileName));
}

export function serveUiEntry(
  res: http.ServerResponse,
  assetsDir: string,
  sendJson: (res: http.ServerResponse, status: number, body: unknown) => void,
  serveFile: (res: http.ServerResponse, assetsDir: string, fileName: string) => void,
): void {
  const primary = "index.html";

  if (hasUiAsset(assetsDir, primary)) {
    serveFile(res, assetsDir, primary);
    return;
  }

  sendJson(res, 503, {
    error: "ASSET_MISSING",
    message: "No UI entrypoint found in assets directory",
    assetsDir,
  });
}

export function serveStaticPath(
  res: http.ServerResponse,
  pathname: string,
  assetsDir: string,
  applyHeaders: (res: http.ServerResponse) => void,
  sendJson: (res: http.ServerResponse, status: number, body: unknown) => void,
): void {
  const rel = pathname.replace(/^\/+/, "");
  const fullPath = path.resolve(assetsDir, rel);

  if (!fullPath.startsWith(assetsDir)) {
    sendJson(res, 400, {
      error: "INVALID_PATH",
      message: "Invalid asset path",
    });
    return;
  }

  if (!fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) {
    sendJson(res, 404, {
      error: "NOT_FOUND",
      message: "Asset not found",
      path: pathname,
    });
    return;
  }

  const ext = path.extname(fullPath).toLowerCase();
  res.statusCode = 200;
  applyHeaders(res);
  res.setHeader("content-type", contentTypeFor(ext));
  if (ext === ".html" || ext === ".js" || ext === ".css") {
    res.setHeader("cache-control", "no-cache");
  }
  res.end(fs.readFileSync(fullPath));
}

export function contentTypeFor(ext: string): string {
  const map: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ico": "image/x-icon",
  };
  return map[ext] ?? "application/octet-stream";
}

export function serveFile(
  res: http.ServerResponse,
  assetsDir: string,
  fileName: string,
  applyHeaders: (res: http.ServerResponse) => void,
  sendJson: (res: http.ServerResponse, status: number, body: unknown) => void,
): void {
  const fullPath = path.join(assetsDir, fileName);
  if (!fs.existsSync(fullPath)) {
    sendJson(res, 503, {
      error: "ASSET_MISSING",
      message: `Missing UI asset: ${fileName}`,
    });
    return;
  }

  const ext = path.extname(fullPath).toLowerCase();
  res.statusCode = 200;
  applyHeaders(res);
  res.setHeader("content-type", contentTypeFor(ext));
  if (ext === ".html" || ext === ".js" || ext === ".css") {
    res.setHeader("cache-control", "no-cache");
  }
  res.end(fs.readFileSync(fullPath));
}
