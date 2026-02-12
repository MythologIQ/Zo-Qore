import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { EvaluationRouter } from "../risk/engine/EvaluationRouter";
import { EventBus } from "../runtime/support/EventBus";
import { defaultQoreConfig } from "@mythologiq/qore-contracts/runtime/QoreConfig";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("EvaluationRouter", () => {
  it("routes high-risk auth events to tier 3", async () => {
    const router = EvaluationRouter.fromConfig(defaultQoreConfig, new EventBus());
    const decision = await router.route({
      id: "evt-1",
      timestamp: new Date().toISOString(),
      category: "user",
      payload: { targetPath: "src/auth/credential-service.ts" },
    });
    expect(decision.tier).toBe(3);
  });

  it("uses novelty fallback based on file size", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qore-router-"));
    tempDirs.push(dir);
    const file = path.join(dir, "small.ts");
    fs.writeFileSync(file, "export const a = 1;", "utf-8");

    const router = EvaluationRouter.fromConfig(defaultQoreConfig);
    const novelty = await router.computeNovelty(
      {
        id: "evt-2",
        timestamp: new Date().toISOString(),
        category: "user",
        payload: { targetPath: file },
      },
      "R2",
      "medium",
    );

    expect(novelty).toBe("low");
  });
});

