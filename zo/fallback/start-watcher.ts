import * as path from "path";
import { LedgerManager } from "../../ledger/engine/LedgerManager";
import { PolicyEngine } from "../../policy/engine/PolicyEngine";
import { EvaluationRouter } from "../../risk/engine/EvaluationRouter";
import { defaultQoreConfig } from "@mythologiq/qore-contracts/runtime/QoreConfig";
import { InMemorySecretStore } from "../../runtime/support/InMemoryStores";
import { QoreRuntimeService } from "../../runtime/service/QoreRuntimeService";
import { FallbackGovernancePipeline } from "./pipeline";

async function main(): Promise<void> {
  const workspace = process.cwd();
  const policyDir = path.join(workspace, "policy", "definitions");
  const watchRoot = process.env.QORE_FALLBACK_WATCH_ROOT ?? workspace;
  const actorId = process.env.QORE_FALLBACK_ACTOR_ID ?? "did:myth:ssh:fallback";
  const ledgerPath = process.env.QORE_LEDGER_PATH ?? path.join(workspace, ".failsafe", "ledger", "soa_ledger.db");

  const ledger = new LedgerManager({
    ledgerPath,
    secretStore: new InMemorySecretStore(),
  });
  const runtime = new QoreRuntimeService(
    new PolicyEngine({ policyDir }),
    EvaluationRouter.fromConfig(defaultQoreConfig),
    ledger,
    defaultQoreConfig,
  );
  await runtime.initialize(policyDir);

  const pipeline = new FallbackGovernancePipeline(runtime, ledger, {
    actorId,
    rootPath: watchRoot,
  });
  pipeline.start();
  console.log(`fallback watcher started for ${watchRoot} as ${actorId}`);

  const shutdown = () => {
    pipeline.stop();
    ledger.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

void main().catch((error) => {
  console.error("failed to start fallback watcher", error);
  process.exit(1);
});

