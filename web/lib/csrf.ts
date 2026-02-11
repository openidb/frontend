import crypto from "crypto";

let _secret: string | undefined;

function getSecret(): string {
  if (_secret) return _secret;
  const isBuild = process.env.NEXT_PHASE === "phase-production-build";
  if (!process.env.CSRF_SECRET && process.env.NODE_ENV === "production" && !isBuild) {
    throw new Error("[csrf] CSRF_SECRET must be set in production.");
  }
  if (!process.env.CSRF_SECRET) {
    console.warn("[csrf] CSRF_SECRET is not set — using a random secret. Tokens will not survive server restarts.");
  }
  _secret = process.env.CSRF_SECRET || crypto.randomUUID();
  return _secret;
}

const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

export function generateCsrfToken(): string {
  const timestamp = Date.now().toString(36);
  const hmac = crypto
    .createHmac("sha256", getSecret())
    .update(timestamp)
    .digest("hex");
  return `${timestamp}.${hmac}`;
}

export function validateCsrfToken(token: string | null): boolean {
  if (!token) return false;

  const dotIndex = token.indexOf(".");
  if (dotIndex === -1) return false;

  const timestamp = token.slice(0, dotIndex);
  const providedHmac = token.slice(dotIndex + 1);

  // Check age
  const created = parseInt(timestamp, 36);
  if (isNaN(created) || Date.now() - created > MAX_AGE_MS) return false;

  // Recompute HMAC
  const expectedHmac = crypto
    .createHmac("sha256", getSecret())
    .update(timestamp)
    .digest("hex");

  // Timing-safe comparison
  if (providedHmac.length !== expectedHmac.length) return false;
  return crypto.timingSafeEqual(
    Buffer.from(providedHmac),
    Buffer.from(expectedHmac)
  );
}
