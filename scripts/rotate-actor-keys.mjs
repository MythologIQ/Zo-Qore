#!/usr/bin/env node
import crypto from "crypto";

function parseArgs(argv) {
  const parsed = {};
  for (let i = 2; i < argv.length; i += 1) {
    const current = argv[i];
    if (!current.startsWith("--")) continue;
    const [key, inlineValue] = current.split("=", 2);
    if (inlineValue !== undefined) {
      parsed[key] = inlineValue;
      continue;
    }
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      parsed[key] = next;
      i += 1;
    } else {
      parsed[key] = "true";
    }
  }
  return parsed;
}

function parseKeyPairs(serialized) {
  const map = new Map();
  if (!serialized) return map;
  for (const token of serialized.split(",")) {
    const pair = token.trim();
    if (!pair) continue;
    const idx = pair.indexOf(":");
    if (idx <= 0 || idx >= pair.length - 1) continue;
    const kid = pair.slice(0, idx).trim();
    const secret = pair.slice(idx + 1).trim();
    if (!kid || !secret) continue;
    map.set(kid, secret);
  }
  return map;
}

function toSerialized(map) {
  return Array.from(map.entries())
    .map(([kid, secret]) => `${kid}:${secret}`)
    .join(",");
}

const args = parseArgs(process.argv);
const current = args["--keys"] ?? process.env.QORE_ACTOR_KEYS ?? "";
const newKid = args["--new-kid"] ?? `k${Date.now()}`;
const newSecret = args["--new-secret"] ?? crypto.randomBytes(32).toString("hex");
const retire = (args["--retire-kids"] ?? "")
  .split(",")
  .map((v) => v.trim())
  .filter(Boolean);

const keyring = parseKeyPairs(current);
keyring.set(newKid, newSecret);
for (const kid of retire) {
  if (kid === newKid) continue;
  keyring.delete(kid);
}

const serialized = toSerialized(keyring);
process.stdout.write(`QORE_ACTOR_KEYS=${serialized}\n`);
process.stdout.write(`QORE_ACTOR_ACTIVE_KID=${newKid}\n`);
process.stdout.write(`QORE_ACTOR_SIGNING_KEY=${newSecret}\n`);
