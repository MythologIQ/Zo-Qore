import * as crypto from "crypto";
import { ActorKeyring } from "./actor-keyring";

export interface RotateActorKeysOptions {
  newKid: string;
  newSecret?: string;
  retireKids?: string[];
}

export interface RotateActorKeysResult {
  serializedKeys: string;
  activeKid: string;
  activeSecret: string;
}

export function generateActorSecret(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("hex");
}

export function serializeActorKeys(keyring: ActorKeyring): string {
  return keyring.entries()
    .map(([kid, secret]) => `${kid}:${secret}`)
    .join(",");
}

export function rotateActorKeys(
  existingSerializedKeys: string | undefined,
  options: RotateActorKeysOptions,
): RotateActorKeysResult {
  const keyring = ActorKeyring.fromEnv(existingSerializedKeys);
  const activeSecret = options.newSecret ?? generateActorSecret();
  keyring.set(options.newKid, activeSecret);
  for (const retireKid of options.retireKids ?? []) {
    if (retireKid === options.newKid) continue;
    keyring.delete(retireKid);
  }
  return {
    serializedKeys: serializeActorKeys(keyring),
    activeKid: options.newKid,
    activeSecret,
  };
}
