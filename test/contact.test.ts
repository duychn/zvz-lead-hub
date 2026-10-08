import { afterEach, describe, expect, it, vi } from "vitest";
import { contactEmail, handleContact } from "../src/contact";
import worker from "../src/index";
import { normalizeLead } from "../src/normalize";
import { scoreWithRules } from "../src/score";
import type { Env } from "../src/types";

/** In-memory stand-in for the KV namespace used by de-duplication. */
const memoryKv = () => {
  const store = new Map<string, string>();
  return {
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string) => { store.set(key, value); },
  } as unknown as KVNamespace;
};

const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;
const post = (env: Env, body: unknown) => worker.fetch!(
  new Request("https://demo.zvzdigital.com/v1/contact", {
    method: "POST", headers: { origin: "https://zvzdigital.com", "content-type": "application/json" }, body: JSON.stringify(body),
  }) as Request<unknown, IncomingRequestCfProperties>, env, ctx);

const enquiry = { name: "Minh Anh", email: "anh@nhakhoa.vn", phone: "0901234567", need: "early-access", message: "Lead Facebook đang chia bằng tay, cần báo giá gấp." };

afterEach(() => vi.restoreAllMocks());

describe("contact email", () => {
  it("puts tier and score in the subject and every field in the body", () => {
    const lead = normalizeLead({ ...enquiry, source: "website-contact" });
    const { subject, text } = contactEmail(lead, scoreWithRules(lead), "Đăng ký early access ZvZ AI Hub", false);
    expect(subject).toMatch(/^\[Lead NÓNG \d+\] Minh Anh — Đăng ký early access/);
    expect(text).toContain("+84901234567");
    expect(text).toContain("anh@nhakhoa.vn");
    expect(text).toContain("Lead Facebook đang chia bằng tay");
  });
});

describe("POST /v1/contact", () => {
  it("returns 503 until Resend is configured, so the site can fall back to email", async () => {
    const res = await post({ LEADS: memoryKv() } as Env, enquiry);
    expect(res.status).toBe(503);
    expect(res.headers.get("access-control-allow-origin")).toBe("https://zvzdigital.com");
  });

  it("emails the scored enquiry with reply-to set to the visitor", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    const res = await post({ LEADS: memoryKv(), RESEND_API_KEY: "re_test" } as Env, enquiry);
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.resend.com/emails");
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body).toMatchObject({ to: ["hi@zvzdigital.com"], reply_to: "anh@nhakhoa.vn" });
  });

  it("silently drops honeypot submissions", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const result = await handleContact({ ...enquiry, website: "http://spam.example" }, { LEADS: memoryKv(), RESEND_API_KEY: "re_test" } as Env);
    expect(result.sent).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("drops forms submitted faster than a person could fill them", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const result = await handleContact({ ...enquiry, elapsedMs: 400 }, { LEADS: memoryKv(), RESEND_API_KEY: "re_test" } as Env);
    expect(result.sent).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("emails an identical repeat from the same contact only once", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response("{}", { status: 200 }));
    const env = { LEADS: memoryKv(), RESEND_API_KEY: "re_test" } as Env;
    await handleContact({ ...enquiry, elapsedMs: 9000 }, env);
    await handleContact({ ...enquiry, elapsedMs: 9000 }, env);
    await handleContact({ ...enquiry, message: "Một câu hỏi khác về giá", elapsedMs: 9000 }, env);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects an empty message", async () => {
    const res = await post({ LEADS: memoryKv(), RESEND_API_KEY: "re_test" } as Env, { ...enquiry, message: "" });
    expect(res.status).toBe(400);
  });

  it("reports a delivery failure as an error instead of claiming success", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("bad key", { status: 401 }));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await post({ LEADS: memoryKv(), RESEND_API_KEY: "re_bad" } as Env, enquiry);
    expect(res.status).toBe(500);
  });
});
