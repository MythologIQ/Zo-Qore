import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

export interface ContentFingerprint {
  hash: string;
  size: number;
  type: string;
  path: string;
  timestamp: number;
}

const MAX_HASH_BYTES = 200 * 1024;

export async function computeContentFingerprint(
  filePath: string,
  content?: string,
): Promise<ContentFingerprint> {
  let fileContent: string;
  let stats: fs.Stats;

  if (content !== undefined) {
    fileContent = content;
    stats = { size: content.length } as fs.Stats; // Mock stats for direct content
  } else {
    // SECURITY: Use file handle to read only required bytes
    // PERFORMANCE: Avoid loading entire file into memory
    const handle = await fs.promises.open(filePath, "r");
    try {
      stats = await handle.stat();
      const bytesToRead = Math.min(stats.size, MAX_HASH_BYTES);
      const buffer = Buffer.alloc(bytesToRead);
      await handle.read(buffer, 0, bytesToRead, 0);
      fileContent = buffer.toString("utf-8");
    } finally {
      await handle.close();
    }
  }

  const hashInput =
    fileContent.length > MAX_HASH_BYTES
      ? fileContent.slice(0, MAX_HASH_BYTES)
      : fileContent;

  const hash = crypto.createHash("sha256").update(hashInput).digest("hex");

  // If we read from file, we already have stats. If content was provided, we need to handle that case for 'path'.
  // But wait, the original code called fs.promises.stat(filePath) even if content was provided?
  // Original:
  // const fileContent = content ?? await readFile...
  // ...
  // const stats = await fs.promises.stat(filePath);

  // So yes, it always stat'ed the file. Let's preserve that behavior but optimize.
  if (content !== undefined) {
    stats = await fs.promises.stat(filePath);
  }

  return {
    hash,
    size: stats.size,
    type: path.extname(filePath).slice(1),
    path: filePath,
    timestamp: Date.now(),
  };
}

export function computeFingerprintSimilarity(
  fp1: ContentFingerprint,
  fp2: ContentFingerprint,
): number {
  if (fp1.hash === fp2.hash) {
    return 1.0;
  }

  if (fp1.type && fp1.type === fp2.type) {
    return 0.8;
  }

  const sizeRatio = Math.min(fp1.size, fp2.size) / Math.max(fp1.size, fp2.size);
  if (sizeRatio > 0.8) {
    return 0.5;
  }

  return 0.0;
}
