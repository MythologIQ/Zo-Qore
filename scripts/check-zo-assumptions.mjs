#!/usr/bin/env node
import fs from "fs";
import path from "path";

const MAX_AGE_DAYS = Number(process.env.QORE_ZO_ASSUMPTION_MAX_AGE_DAYS ?? "30");
const ALLOWED_FUTURE_SKEW_MINUTES = Number(
  process.env.QORE_ZO_ASSUMPTION_FUTURE_SKEW_MINUTES ?? "5",
);
const evidencePath = path.resolve(
  process.env.QORE_ZO_ASSUMPTION_EVIDENCE_PATH ?? "docs/ZO_ASSUMPTION_EVIDENCE.json",
);

function parseDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function daysBetween(a, b) {
  const diff = a.getTime() - b.getTime();
  return Math.floor(diff / (24 * 60 * 60 * 1000));
}

if (!fs.existsSync(evidencePath)) {
  console.error(`Missing Zo assumption evidence file: ${evidencePath}`);
  process.exit(1);
}

const raw = fs.readFileSync(evidencePath, "utf-8");
const parsed = JSON.parse(raw);
const items = Array.isArray(parsed.items) ? parsed.items : [];

if (items.length === 0) {
  console.error("Zo assumption evidence contains no items.");
  process.exit(1);
}

const now = new Date();
const failures = [];
for (const item of items) {
  if (!item.id || !item.surface || !item.claim || !item.source || !item.validatedAt) {
    failures.push(`Missing required fields for item: ${JSON.stringify(item)}`);
    continue;
  }
  const validated = parseDate(item.validatedAt);
  if (!validated) {
    failures.push(`Invalid validatedAt for ${item.id}: ${item.validatedAt}`);
    continue;
  }
  const ageDays = daysBetween(now, validated);
  const futureSkewMs = validated.getTime() - now.getTime();
  if (futureSkewMs > ALLOWED_FUTURE_SKEW_MINUTES * 60 * 1000) {
    failures.push(
      `Future-dated Zo assumption evidence for ${item.id}: validatedAt=${item.validatedAt}`,
    );
    continue;
  }
  if (ageDays > MAX_AGE_DAYS) {
    failures.push(
      `Stale Zo assumption evidence for ${item.id}: ${ageDays} days old (max ${MAX_AGE_DAYS})`,
    );
  }
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(failure);
  }
  process.exit(1);
}

console.log(
  `Zo assumption evidence check passed (${items.length} items, max age ${MAX_AGE_DAYS} days).`,
);
