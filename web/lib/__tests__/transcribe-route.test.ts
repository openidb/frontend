import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// We test the transcribe route's CSRF validation and request forwarding logic.
// Since Next.js route handlers are just async functions, we can import and call them.

let POST: (request: Request) => Promise<Response>;

beforeEach(async () => {
  vi.resetModules();
  vi.stubEnv("CSRF_SECRET", "test-secret");
  vi.stubEnv("INTERNAL_API_SECRET", "test-internal-secret");
  vi.stubEnv("OPENIDB_URL", "http://test-api:4000");

  // Mock fetch
  vi.stubGlobal("fetch", vi.fn(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      body: new ReadableStream(),
      headers: new Headers({ "Content-Type": "application/json" }),
    })
  ));

  const mod = await import("../../app/api/transcribe/route");
  POST = mod.POST;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("POST /api/transcribe", () => {
  it("rejects requests without CSRF token", async () => {
    const request = new Request("http://localhost/api/transcribe", {
      method: "POST",
      body: new FormData(),
    });

    const response = await POST(request);
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toContain("CSRF");
  });

  it("rejects requests with invalid CSRF token", async () => {
    const request = new Request("http://localhost/api/transcribe", {
      method: "POST",
      headers: { "x-csrf-token": "invalid.token" },
      body: new FormData(),
    });

    const response = await POST(request);
    expect(response.status).toBe(403);
  });

  it("accepts requests with valid CSRF token and forwards to backend", async () => {
    // Generate a valid CSRF token
    const { generateCsrfToken } = await import("../../lib/csrf");
    const token = generateCsrfToken();

    const formData = new FormData();
    formData.append("audio", new Blob(["test"]), "audio.webm");

    const request = new Request("http://localhost/api/transcribe", {
      method: "POST",
      headers: { "x-csrf-token": token },
      body: formData,
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    // Verify internal secret was forwarded
    const fetchCalls = (fetch as ReturnType<typeof vi.fn>).mock.calls;
    expect(fetchCalls.length).toBeGreaterThan(0);
    const [url, options] = fetchCalls[fetchCalls.length - 1];
    expect(url).toContain("/api/transcribe");
    expect(options.headers["X-Internal-Secret"]).toBe("test-internal-secret");
  });
});
