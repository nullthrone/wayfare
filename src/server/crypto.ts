import "server-only";
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { config } from "./config";

/**
 * Cryptographic helpers. All keys are derived from WAYFARE_SECRET via HKDF with a
 * purpose label, so a leak of one derived key does not compromise the others.
 */

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, keylen: number, opts: { N: number; r: number; p: number; maxmem: number }) => Promise<Buffer>;

type Purpose = "media" | "unlock" | "oauth-state" | "token-enc" | "visitor" | "generic";

function deriveKey(purpose: Purpose): Buffer {
  return Buffer.from(hkdfSync("sha256", config().WAYFARE_SECRET, "wayfare", `wayfare:${purpose}`, 32));
}

const keyCache = new Map<Purpose, Buffer>();
function key(purpose: Purpose): Buffer {
  let k = keyCache.get(purpose);
  if (!k) {
    k = deriveKey(purpose);
    keyCache.set(purpose, k);
  }
  return k;
}

/** base64url HMAC-SHA256 of `data`. */
export function sign(purpose: Purpose, data: string): string {
  return createHmac("sha256", key(purpose)).update(data).digest("base64url");
}

/** Constant-time verification of sign(). */
export function verify(purpose: Purpose, data: string, signature: string): boolean {
  const expected = Buffer.from(sign(purpose, data));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** Signed, expiring token: base64url(json).sig — for OAuth state etc. */
export function sealToken(purpose: Purpose, payload: Record<string, unknown>, ttlSeconds: number): string {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds })).toString("base64url");
  return `${body}.${sign(purpose, body)}`;
}

export function openToken<T extends Record<string, unknown>>(purpose: Purpose, token: string): T | null {
  const [body, sig] = token.split(".");
  if (!body || !sig || !verify(purpose, body, sig)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T & { exp: number };
    if (typeof parsed.exp !== "number" || parsed.exp < Date.now() / 1000) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** AES-256-GCM. Output: v1.iv.tag.ciphertext (base64url parts). */
export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key("token-enc"), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ct.toString("base64url")].join(".");
}

export function decrypt(payload: string): string {
  const [v, iv, tag, ct] = payload.split(".");
  if (v !== "v1" || !iv || !tag || !ct) throw new Error("Unsupported ciphertext format");
  const decipher = createDecipheriv("aes-256-gcm", key("token-enc"), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8");
}

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 };

/** Format: scrypt$N$r$p$salt$hash */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password.normalize("NFKC"), salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: 64 * 1024 * 1024 });
  return ["scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString("base64url"), hash.toString("base64url")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, n, r, p, saltB64, hashB64] = stored.split("$");
  if (algo !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64url");
  const actual = await scrypt(password.normalize("NFKC"), Buffer.from(saltB64, "base64url"), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: 64 * 1024 * 1024,
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function randomToken(bytes = 24): string {
  return randomBytes(bytes).toString("base64url");
}
