import { spawn } from "child_process";
import * as path from "path";
import { LedgerManager } from "../../../ledger/engine/LedgerManager";
import { PolicyEngine } from "../../../policy/engine/PolicyEngine";
import { EvaluationRouter } from "../../../risk/engine/EvaluationRouter";
import { defaultQoreConfig } from "@mythologiq/qore-contracts/runtime/QoreConfig";
import { InMemorySecretStore } from "../../../runtime/support/InMemoryStores";
import { QoreRuntimeService } from "../../../runtime/service/QoreRuntimeService";
import { evaluateFallbackCommand } from "../failsafe-run";
import { resolveSshActorContext, verifySshActorContext } from "../identity";

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error("Usage: failsafe-run <command> [args...]");
    return 2;
  }

  const command = args.join(" ");
  const actorCtx = resolveSshActorContext(process.env);
  const actorSecret = process.env.QORE_SSH_ACTOR_SECRET;
  if (!actorSecret || !verifySshActorContext(actorCtx, actorSecret)) {
    console.error("Unauthorized actor context");
    return 3;
  }

  const workspace = process.cwd();
  const ledger = new LedgerManager({
    ledgerPath: path.join(workspace, ".failsafe", "ledger", "soa_ledger.db"),
    secretStore: new InMemorySecretStore(),
  });

  try {
    const runtime = new QoreRuntimeService(
      new PolicyEngine({ policyDir: path.join(workspace, "policy", "definitions") }),
      EvaluationRouter.fromConfig(defaultQoreConfig),
      ledger,
      defaultQoreConfig,
    );
    await runtime.initialize(path.join(workspace, "policy", "definitions"));
    const result = await evaluateFallbackCommand(runtime, {
      actorId: actorCtx.actorId,
      command,
      workingDirectory: workspace,
    });

    if (!result.allowed) {
      console.error(`Blocked by governance: ${result.reason}`);
      return 10;
    }

    const child = spawn(args[0], args.slice(1), { stdio: "inherit", shell: true });
    const exitCode = await new Promise<number>((resolve) => {
      child.on("close", (code) => resolve(code ?? 1));
    });
    return exitCode;
  } finally {
    ledger.close();
  }
}

void main().then((code) => process.exit(code));

