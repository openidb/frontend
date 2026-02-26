import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { generateCsrfToken, validateCsrfToken } from "../csrf";

describe("csrf", () => {
  beforeEach(() => {
    // Reset module-level cached secret between tests
    vi.stubEnv("CSRF_SECRET", "test-secret-key-for-csrf");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("generateCsrfToken", () => {
    it("returns a string with timestamp.hmac format", () => {
      const token = generateCsrfToken();
      expect(token).toContain(".");
      const parts = token.split(".");
      expect(parts).toHaveLength(2);
      expect(parts[0].length).toBeGreaterThan(0);
      expect(parts[1].length).toBe(64); // sha256 hex = 64 chars
    });

    it("generates unique tokens on each call", () => {
      const token1 = generateCsrfToken();
      // Advance time slightly to ensure different timestamps
      vi.spyOn(Date, "now").mockReturnValue(Date.now() + 1);
      const token2 = generateCsrfToken();
      expect(token1).not.toBe(token2);
    });
  });

  describe("validateCsrfToken", () => {
    it("validates a freshly generated token", () => {
      const token = generateCsrfToken();
      expect(validateCsrfToken(token)).toBe(true);
    });

    it("rejects null", () => {
      expect(validateCsrfToken(null)).toBe(false);
    });

    it("rejects empty string", () => {
      expect(validateCsrfToken("")).toBe(false);
    });

    it("rejects token without dot separator", () => {
      expect(validateCsrfToken("nodot")).toBe(false);
    });

    it("rejects token with tampered HMAC", () => {
      const token = generateCsrfToken();
      const [timestamp] = token.split(".");
      const tampered = `${timestamp}.${"a".repeat(64)}`;
      expect(validateCsrfToken(tampered)).toBe(false);
    });

    it("rejects token with tampered timestamp", () => {
      const token = generateCsrfToken();
      const [, hmac] = token.split(".");
      const tampered = `zzzzz.${hmac}`;
      expect(validateCsrfToken(tampered)).toBe(false);
    });

    it("rejects expired tokens (older than 24 hours)", () => {
      // Generate a token with a timestamp from 25 hours ago
      const oldTimestamp = (Date.now() - 25 * 60 * 60 * 1000).toString(36);
      const crypto = require("crypto");
      const hmac = crypto
        .createHmac("sha256", "test-secret-key-for-csrf")
        .update(oldTimestamp)
        .digest("hex");
      const expiredToken = `${oldTimestamp}.${hmac}`;
      expect(validateCsrfToken(expiredToken)).toBe(false);
    });

    it("rejects tokens with mismatched HMAC length", () => {
      const token = generateCsrfToken();
      const [timestamp] = token.split(".");
      const shortHmac = `${timestamp}.abc`;
      expect(validateCsrfToken(shortHmac)).toBe(false);
    });

    it("rejects token with NaN timestamp", () => {
      expect(validateCsrfToken("not-a-number.abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890")).toBe(false);
    });
  });
});
