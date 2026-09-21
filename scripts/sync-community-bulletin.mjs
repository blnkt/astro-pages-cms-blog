#!/usr/bin/env node
/**
 * Fetch the public Google Doc HTML export, extract embedded images, and write:
 * - src/data/community-bulletin.html (lean markup)
 * - public/bulletin-media/* (extracted images)
 *
 * Doc must be shared as "Anyone with the link can view".
 */
import { createHash } from "node:crypto";
import {
  access,
  mkdir,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DOC_ID =
  process.env.COMMUNITY_BULLETIN_DOC_ID ||
  "1BFpISLhWO9p_By424dsPlaHQvFm7mebjH7tGnjMigjA";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const OUT_HTML = path.join(ROOT, "src/data/community-bulletin.html");
const OUT_TXT = path.join(ROOT, "src/data/community-bulletin.txt");
const MEDIA_DIR = path.join(ROOT, "public/bulletin-media");
/** Relative to /announcements/ so Astro `base` keeps working. */
const MEDIA_SRC_PREFIX = "../bulletin-media";
const EXPORT_URL = `https://docs.google.com/document/d/${DOC_ID}/export?format=html`;

const MIME_EXT = {
  jpeg: "jpg",
  jpg: "jpg",
  png: "png",
  gif: "gif",
  webp: "webp",
  "svg+xml": "svg",
};

function hash(text) {
  return createHash("sha256").update(text).digest("hex");
}

function shortHash(buf) {
  return createHash("sha256").update(buf).digest("hex").slice(0, 12);
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function loadSharp() {
  try {
    const mod = await import("sharp");
    return mod.default;
  } catch {
    return null;
  }
}

async function encodeImage(buffer, mimeSubtype) {
  const sharp = await loadSharp();
  if (sharp) {
    try {
      const out = await sharp(buffer)
        .rotate()
        .jpeg({ quality: 78, mozjpeg: true })
        .toBuffer();
      return { buffer: out, ext: "jpg" };
    } catch {
      // fall through to raw bytes
    }
  }

  const ext = MIME_EXT[mimeSubtype.toLowerCase()] || "bin";
  return { buffer, ext };
}

/**
 * Prefer a cached jpeg keyed by the raw export bytes. Fall back to other
 * extensions from older syncs / sharp-less runs.
 */
async function findCachedImage(rawKey) {
  for (const ext of ["jpg", "jpeg", "png", "gif", "webp", "svg", "bin"]) {
    const name = `img-${rawKey}.${ext}`;
    const filePath = path.join(MEDIA_DIR, name);
    if (await fileExists(filePath)) {
      return { name, filePath };
    }
  }
  return null;
}

async function writeImage(image) {
  const rawKey = shortHash(image.raw);
  const cached = await findCachedImage(rawKey);
  if (cached) {
    return {
      name: cached.name,
      skipped: true,
    };
  }

  const encoded = await encodeImage(image.raw, image.mimeSubtype);
  const name = `img-${rawKey}.${encoded.ext}`;
  const filePath = path.join(MEDIA_DIR, name);
  await writeFile(filePath, encoded.buffer);
  return {
    name,
    skipped: false,
    bytes: encoded.buffer.length,
  };
}

function extractAndReplaceImages(html, images) {
  let index = 0;
  return html.replace(/<img\b[^>]*>/gi, tag => {
    const match = tag.match(
      /src=(["'])(data:image\/([a-z0-9+.-]+);base64,([\s\S]+?))\1/i
    );
    if (!match) return "";

    const mimeSubtype = match[3];
    const b64 = match[4].replace(/\s/g, "");
    let raw;
    try {
      raw = Buffer.from(b64, "base64");
    } catch {
      return "";
    }
    if (!raw.length) return "";

    const id = index;
    index += 1;
    images.push({ id, mimeSubtype, raw });
    return `<img data-bulletin-img="${id}" alt="" loading="lazy" />`;
  });
}

function simplifyHtml(html) {
  let out = html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");

  const body = out.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  if (body) out = body[1];

  out = out
    .replace(/\s(class|id|style|dir|role|aria-[\w-]+)="[^"]*"/gi, "")
    .replace(/<\/?(span|font|o:p)(\s[^>]*)?>/gi, "");

  // Normalize links: keep href only
  out = out.replace(/<a\b([^>]*)>/gi, full => {
    const href = full.match(/\bhref=(["'])(.*?)\1/i);
    if (!href) return "<a>";
    return `<a href="${href[2]}" target="_blank" rel="noopener noreferrer">`;
  });

  out = out
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();

  // Drop Google Docs reaction footers when present as text.
  out = out.replace(/\[a\]\d+\s+total reaction[\s\S]*$/i, "").trim();

  return `${out}\n`;
}

async function main() {
  const response = await fetch(EXPORT_URL, {
    headers: { "User-Agent": "spirit-machine-bulletin-sync/1.0" },
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(
      `Google Doc export failed: ${response.status} ${response.statusText}`
    );
  }

  const rawHtml = await response.text();
  if (
    /sign in|accounts\.google|browser version is no longer supported/i.test(
      rawHtml
    ) &&
    rawHtml.length < 2000
  ) {
    throw new Error(
      "Export did not return document HTML. Confirm the Doc is shared as Anyone with the link can view."
    );
  }

  const images = [];
  let html = extractAndReplaceImages(rawHtml, images);
  html = simplifyHtml(html);

  await mkdir(MEDIA_DIR, { recursive: true });
  await mkdir(path.dirname(OUT_HTML), { recursive: true });

  const keptFiles = new Set();
  const idToSrc = new Map();
  let compressed = 0;
  let cached = 0;

  for (const image of images) {
    const result = await writeImage(image);
    keptFiles.add(result.name);
    idToSrc.set(image.id, `${MEDIA_SRC_PREFIX}/${result.name}`);
    if (result.skipped) {
      cached += 1;
      console.log(`Image ${image.id + 1}: ${result.name} (cached)`);
    } else {
      compressed += 1;
      console.log(
        `Image ${image.id + 1}: ${result.name} (${(result.bytes / 1024).toFixed(1)} KB)`
      );
    }
  }

  html = html.replace(
    /<img data-bulletin-img="(\d+)" alt="" loading="lazy" \/>/g,
    (_, id) => {
      const src = idToSrc.get(Number(id));
      if (!src) return "";
      return `<img src="${src}" alt="" loading="lazy" />`;
    }
  );

  // Remove orphaned media from prior syncs.
  for (const name of await readdir(MEDIA_DIR)) {
    if (!keptFiles.has(name)) {
      await rm(path.join(MEDIA_DIR, name), { force: true });
      console.log(`Removed stale media ${name}`);
    }
  }

  // Drop legacy text export if present.
  await rm(OUT_TXT, { force: true });

  let previous = "";
  try {
    previous = await readFile(OUT_HTML, "utf8");
  } catch {
    previous = "";
  }

  if (hash(previous) === hash(html)) {
    console.log("Community bulletin HTML unchanged.");
    return;
  }

  await writeFile(OUT_HTML, html, "utf8");
  console.log(
    `Updated ${path.relative(ROOT, OUT_HTML)} (${html.length} bytes, ${keptFiles.size} images; ${cached} cached, ${compressed} encoded).`
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
