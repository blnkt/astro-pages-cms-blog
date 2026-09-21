#!/usr/bin/env node
/**
 * Fetch the public Google Doc export and write src/data/community-bulletin.txt
 * when content changes. Used locally and by the sync-community-bulletin workflow.
 *
 * Doc must be shared as "Anyone with the link can view".
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DOC_ID =
  process.env.COMMUNITY_BULLETIN_DOC_ID ||
  "1BFpISLhWO9p_By424dsPlaHQvFm7mebjH7tGnjMigjA";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const OUT_FILE = path.join(ROOT, "src/data/community-bulletin.txt");
const EXPORT_URL = `https://docs.google.com/document/d/${DOC_ID}/export?format=txt`;

function normalizeBulletin(text) {
  let normalized = text.replace(/\r\n/g, "\n").replace(/\u00a0/g, " ").trim();

  // Drop Google Docs “reactions” footer noise when present.
  normalized = normalized.replace(
    /\n\[a\]\d+\s+total reaction[\s\S]*$/i,
    ""
  );

  return `${normalized.trim()}\n`;
}

function hash(text) {
  return createHash("sha256").update(text).digest("hex");
}

async function main() {
  const response = await fetch(EXPORT_URL, {
    headers: {
      "User-Agent": "spirit-machine-bulletin-sync/1.0",
    },
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(
      `Google Doc export failed: ${response.status} ${response.statusText}`
    );
  }

  const raw = await response.text();
  if (/sign in|accounts\.google|browser version is no longer supported/i.test(raw) && raw.length < 2000) {
    throw new Error(
      "Export did not return document text. Confirm the Doc is shared as Anyone with the link can view."
    );
  }

  const next = normalizeBulletin(raw);
  if (next.trim().length < 20) {
    throw new Error("Export looked empty after normalization.");
  }

  await mkdir(path.dirname(OUT_FILE), { recursive: true });

  let previous = "";
  try {
    previous = await readFile(OUT_FILE, "utf8");
  } catch {
    previous = "";
  }

  if (hash(previous) === hash(next)) {
    console.log("Community bulletin unchanged.");
    return;
  }

  await writeFile(OUT_FILE, next, "utf8");
  console.log(`Updated ${path.relative(ROOT, OUT_FILE)} (${next.length} bytes).`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
