import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildActionMarker, buildCommentBody } from "./api";
import { decryptIntegrationSecret, encryptIntegrationSecret, parseGitHubRepositoryUrl, verifyGitHubSignature } from "./crypto";

afterEach(() => vi.unstubAllEnvs());

describe("GitHub integration security helpers", () => {
  it("encrypts credentials with authenticated encryption and rejects decryption under a rotated key", () => {
    vi.stubEnv("OPERANT_INTEGRATION_ENCRYPTION_KEY", Buffer.alloc(32, 7).toString("base64"));
    const ciphertext = encryptIntegrationSecret("ghp_unit_test_secret_only");
    expect(ciphertext).not.toContain("ghp_unit_test_secret_only");
    expect(decryptIntegrationSecret(ciphertext)).toBe("ghp_unit_test_secret_only");
    vi.stubEnv("OPERANT_INTEGRATION_ENCRYPTION_KEY", Buffer.alloc(32, 8).toString("base64"));
    expect(() => decryptIntegrationSecret(ciphertext)).toThrow("Stored integration credential cannot be decrypted.");
  });

  it("verifies only a well-formed constant-time SHA-256 webhook signature over the raw bytes", () => {
    const body = Buffer.from('{"action":"opened","issue":{"number":17}}');
    const secret = "unit-test-webhook-secret";
    const signature = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
    expect(verifyGitHubSignature(body, signature, secret)).toBe(true);
    expect(verifyGitHubSignature(Buffer.from(`${body.toString()} `), signature, secret)).toBe(false);
    expect(verifyGitHubSignature(body, undefined, secret)).toBe(false);
    expect(verifyGitHubSignature(body, "sha1=deadbeef", secret)).toBe(false);
  });

  it("accepts only ordinary HTTPS GitHub repository paths", () => {
    expect(parseGitHubRepositoryUrl("https://github.com/Example/Service.git")).toEqual({ owner: "Example", repo: "Service" });
    for (const value of ["http://github.com/example/repo", "https://github.com.example.test/example/repo", "https://user:pass@github.com/example/repo", "https://github.com/example/repo/issues/1", "https://github.com/example/repo?redirect=1"]) {
      expect(parseGitHubRepositoryUrl(value)).toBeNull();
    }
  });

  it("keeps the approved body exact and appends a deterministic request marker", () => {
    const hash = "a".repeat(64);
    const marker = buildActionMarker(9, hash);
    expect(buildCommentBody("  Reviewed; please confirm.  ", 9, hash)).toBe(`Reviewed; please confirm.\n\n${marker}`);
    expect(buildActionMarker(9, hash)).toBe(marker);
    expect(buildActionMarker(10, hash)).not.toBe(marker);
  });
});
