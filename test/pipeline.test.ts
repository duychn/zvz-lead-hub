import { describe, expect, it } from "vitest";
import { leadFingerprint } from "../src/dedupe";
import { isValidMetaSignature, leadgenIds, mapMetaFields, verifyMetaSubscription } from "../src/meta";
import { InvalidLeadError, normalizeEmail, normalizeLead, normalizePhoneVN } from "../src/normalize";
import { scoreLead, scoreWithRules } from "../src/score";

describe("normalizePhoneVN", () => {
  it.each([
    ["0901234567", "+84901234567"],
    ["090 123 4567", "+84901234567"],
    ["+84 90-123-4567", "+84901234567"],
    ["84.90.123.4567", "+84901234567"],
    ["0381234567", "+84381234567"],
  ])("normalizes %s", (raw, expected) => expect(normalizePhoneVN(raw)).toBe(expected));

  it.each(["", "12345", "0201234567", "09012345678", undefined])("rejects %s", (raw) =>
    expect(normalizePhoneVN(raw)).toBeNull());
});

describe("normalizeLead", () => {
  it("requires a phone or an email", () => {
    expect(() => normalizeLead({ name: "A", message: "hi" })).toThrow(InvalidLeadError);
  });

  it("cleans fields and defaults the source", () => {
    const lead = normalizeLead({ name: "  Minh   Anh ", email: " Anh@Example.COM ", message: "x" }, new Date("2026-10-07T00:00:00Z"));
    expect(lead).toMatchObject({ name: "Minh Anh", email: "anh@example.com", phone: null, source: "website" });
    expect(lead.receivedAt).toBe("2026-10-07T00:00:00.000Z");
  });

  it("rejects malformed email", () => expect(normalizeEmail("not-an-email")).toBeNull());
});

describe("dedupe fingerprint", () => {
  it("is stable for the same phone and never contains the raw number", async () => {
    const a = normalizeLead({ phone: "0901234567", message: "a" });
    const b = normalizeLead({ phone: "+84 901 234 567", message: "b" });
    const fp = await leadFingerprint(a);
    expect(fp).toBe(await leadFingerprint(b));
    expect(fp).not.toContain("901234567");
  });
});

describe("rule-based scoring", () => {
  it("rates a contactable lead asking for a quote urgently as hot", () => {
    const lead = normalizeLead({ phone: "0901234567", company: "Nha khoa", message: "Cho mình xin báo giá, tuần này cần gấp" });
    expect(scoreWithRules(lead)).toMatchObject({ tier: "hot", scorer: "rules" });
  });

  it("rates a bare lead for review", () => {
    expect(scoreWithRules(normalizeLead({ email: "a@b.co", message: "hi" })).tier).toBe("review");
  });

  it("falls back to rules when no API key is set", async () => {
    const score = await scoreLead(normalizeLead({ phone: "0901234567", message: "báo giá" }));
    expect(score.scorer).toBe("rules");
  });
});

describe("Meta webhook", () => {
  it("answers the verification handshake only with the right token", () => {
    const ok = new URL("https://x/webhooks/meta?hub.mode=subscribe&hub.verify_token=t&hub.challenge=42");
    expect(verifyMetaSubscription(ok, "t").status).toBe(200);
    expect(verifyMetaSubscription(ok, "other").status).toBe(403);
    expect(verifyMetaSubscription(ok, undefined).status).toBe(403);
  });

  it("validates X-Hub-Signature-256", async () => {
    const body = '{"entry":[]}';
    // HMAC-SHA256('{"entry":[]}', 'secret')
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode("secret"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = [...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)))]
      .map((b) => b.toString(16).padStart(2, "0")).join("");
    expect(await isValidMetaSignature(body, `sha256=${sig}`, "secret")).toBe(true);
    expect(await isValidMetaSignature(body, `sha256=${sig}`, "wrong")).toBe(false);
    expect(await isValidMetaSignature(body, null, "secret")).toBe(false);
  });

  it("extracts leadgen IDs and maps standard form fields", () => {
    const payload = { entry: [{ changes: [{ field: "leadgen", value: { leadgen_id: "123" } }, { field: "feed", value: {} }] }] };
    expect(leadgenIds(payload)).toEqual(["123"]);
    const lead = mapMetaFields([{ name: "full_name", values: ["Lan"] }, { name: "phone_number", values: ["0912345678"] }], "Spring");
    expect(lead).toMatchObject({ name: "Lan", phone: "0912345678", source: "meta", campaign: "Spring" });
  });
});
