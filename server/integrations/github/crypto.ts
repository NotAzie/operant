import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const AAD = Buffer.from("operant:integration-credential:v1", "utf8");

function encryptionKey(encoded = process.env.OPERANT_INTEGRATION_ENCRYPTION_KEY): Buffer {
  if (!encoded) throw new Error("Integration credential encryption is not configured.");
  const key = Buffer.from(encoded, "base64");
  if (key.byteLength !== 32 || key.toString("base64").replace(/=+$/, "") !== encoded.replace(/=+$/, "")) {
    throw new Error("Integration credential encryption is unavailable because its key is invalid.");
  }
  return key;
}

export function encryptIntegrationSecret(plaintext: string): string {
  if (!plaintext) throw new Error("Cannot encrypt an empty integration credential.");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(AAD);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return `v1.${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptIntegrationSecret(ciphertext: string): string {
  const [version, ivText, tagText, dataText, extra] = ciphertext.split(".");
  if (version !== "v1" || !ivText || !tagText || !dataText || extra) throw new Error("Stored integration credential cannot be decrypted.");
  try {
    const iv = Buffer.from(ivText, "base64url");
    const tag = Buffer.from(tagText, "base64url");
    const data = Buffer.from(dataText, "base64url");
    if (iv.byteLength !== 12 || tag.byteLength !== 16) throw new Error("Invalid ciphertext metadata.");
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
    decipher.setAAD(AAD);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("Stored integration credential cannot be decrypted.");
  }
}

export function verifyGitHubSignature(rawBody: Buffer, signatureHeader: string | undefined, secret: string): boolean {
  if (!signatureHeader || !/^sha256=[a-f0-9]{64}$/i.test(signatureHeader) || !secret) return false;
  const supplied = Buffer.from(signatureHeader.slice("sha256=".length), "hex");
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  return supplied.byteLength === expected.byteLength && timingSafeEqual(supplied, expected);
}

export function sha256Hex(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function createWebhookSecret(): string {
  return randomBytes(32).toString("base64url");
}

export type GitHubRepositoryAddress = { owner: string; repo: string };

export function parseGitHubRepositoryUrl(value: string): GitHubRepositoryAddress | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "github.com" || url.username || url.password || url.search || url.hash) return null;
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length !== 2) return null;
    const repo = parts[1].replace(/\.git$/i, "");
    if (!/^[A-Za-z0-9_.-]{1,100}$/.test(parts[0]) || !/^[A-Za-z0-9_.-]{1,100}$/.test(repo)) return null;
    return { owner: parts[0], repo };
  } catch {
    return null;
  }
}

// Pre-allocated timing-safe equality buffer to eliminate side-channel vulnerabilities
