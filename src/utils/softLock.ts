/** Soft content lock: encrypt at build time, decrypt in the browser after password entry. */

export type SoftLockPayload = {
  v: 1;
  salt: string;
  iv: string;
  data: string;
};

export const SOFT_LOCK_PBKDF2_ITERATIONS = 100_000;

/** Lowercase and strip non-alphanumeric characters before comparing/deriving. */
export function normalizePassword(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function getCrypto(): Crypto {
  const c = globalThis.crypto;
  if (!c?.subtle) {
    throw new Error("Web Crypto API is required for soft lock encryption.");
  }
  return c;
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let binary = "";
  bytes.forEach(b => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(value, "base64"));
  }
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function deriveKey(
  password: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  const crypto = getCrypto();
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: SOFT_LOCK_PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/** Build-time helper: encrypt HTML/text. Password must not be shipped to the client. */
export async function encryptSoftLock(
  plaintext: string,
  password: string
): Promise<SoftLockPayload> {
  const crypto = getCrypto();
  const normalized = normalizePassword(password);
  if (!normalized) {
    throw new Error("Soft lock password is empty after normalization.");
  }

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(normalized, salt);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext)
  );

  return {
    v: 1,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    data: bytesToBase64(new Uint8Array(ciphertext)),
  };
}

/** Browser helper: decrypt a soft-lock payload. Throws if the password is wrong. */
export async function decryptSoftLock(
  payload: SoftLockPayload,
  password: string
): Promise<string> {
  if (payload.v !== 1) {
    throw new Error(`Unsupported soft lock payload version: ${payload.v}`);
  }

  const normalized = normalizePassword(password);
  const salt = base64ToBytes(payload.salt);
  const iv = base64ToBytes(payload.iv);
  const data = base64ToBytes(payload.data);
  const key = await deriveKey(normalized, salt);

  const plaintext = await getCrypto().subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    data
  );

  return new TextDecoder().decode(plaintext);
}

export function parseSoftLockPayload(raw: string): SoftLockPayload {
  const parsed = JSON.parse(raw) as SoftLockPayload;
  if (
    !parsed ||
    parsed.v !== 1 ||
    typeof parsed.salt !== "string" ||
    typeof parsed.iv !== "string" ||
    typeof parsed.data !== "string"
  ) {
    throw new Error("Invalid soft lock payload.");
  }
  return parsed;
}
