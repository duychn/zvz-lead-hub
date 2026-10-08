import { isDuplicate, leadFingerprint } from "./dedupe";
import { forwardLead } from "./forward";
import { InvalidLeadError, normalizeLead } from "./normalize";
import { scoreLead } from "./score";
import type { Env, IncomingLead, Lead, Score } from "./types";

/** Contact-form submission from zvzdigital.com. `website` is a honeypot real visitors never fill. */
export interface ContactInput extends IncomingLead {
  need?: string;
  website?: string;
  page?: string;
  /** Milliseconds the visitor spent on the form before submitting. */
  elapsedMs?: number;
}

/** People need at least a few seconds to fill the form; scripts usually submit instantly. */
export const MIN_FILL_MS = 3000;
/** Identical enquiries from the same contact inside this window are emailed only once. */
export const REPEAT_WINDOW_SECONDS = 10 * 60;

const sha256 = async (text: string) => {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
};

/** Records the enquiry and reports whether the same contact sent the same message moments ago. */
async function isRepeatSubmission(kv: KVNamespace, lead: Lead): Promise<boolean> {
  const key = `contact:${await leadFingerprint(lead)}:${await sha256(lead.message.toLowerCase())}`;
  if (await kv.get(key)) return true;
  await kv.put(key, "1", { expirationTtl: REPEAT_WINDOW_SECONDS });
  return false;
}

const NEED_LABELS: Record<string, string> = {
  "early-access": "Đăng ký early access ZvZ AI Hub",
  performance: "Quảng cáo & đo lường hiệu quả",
  leads: "Tự động hóa tiếp nhận lead",
  retention: "Chăm sóc & giữ chân khách hàng",
  unsure: "Cần tư vấn hướng triển khai",
};

const TIER_LABELS: Record<Score["tier"], string> = { hot: "NÓNG", warm: "ẤM", review: "CẦN KIỂM TRA" };

export const DEFAULT_CONTACT_TO = "hi@zvzdigital.com";
export const DEFAULT_CONTACT_FROM = "ZvZ Lead Hub <leads@zvzdigital.com>";

/** Plain-text notification the ZvZ team reads in its inbox; Reply goes straight to the visitor. */
export function contactEmail(lead: Lead, score: Score, need: string, duplicate: boolean, page?: string) {
  const subject = `[Lead ${TIER_LABELS[score.tier]} ${score.score}] ${lead.name} — ${need}`;
  const text = [
    `Điểm: ${score.score}/100 (${TIER_LABELS[score.tier]}) — ${score.reason}`,
    `Bộ chấm: ${score.scorer === "claude" ? "Claude API" : "quy tắc"}`,
    duplicate ? "Lưu ý: người này đã gửi yêu cầu trong 30 ngày qua." : "",
    "",
    `Họ tên: ${lead.name}`,
    `Doanh nghiệp: ${lead.company ?? "—"}`,
    `Email: ${lead.email ?? "—"}`,
    `Điện thoại: ${lead.phone ?? "—"}`,
    `Nhu cầu: ${need}`,
    "",
    "Lời nhắn:",
    lead.message || "—",
    "",
    `Trang gửi: ${page ?? "zvzdigital.com"} · ${lead.receivedAt}`,
  ].filter((line, i, all) => line !== "" || all[i - 1] !== "").join("\n");
  return { subject, text };
}

async function sendWithResend(env: Env, to: string, subject: string, text: string, replyTo: string | null): Promise<void> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: env.CONTACT_FROM ?? DEFAULT_CONTACT_FROM,
      to: [to],
      subject,
      text,
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
  });
  if (!res.ok) throw new Error(`Resend returned ${res.status}: ${await res.text()}`);
}

/**
 * Runs a website enquiry through the same pipeline as any other lead
 * (normalize → dedupe check → score → optional CRM forward) and emails it to the team.
 */
export async function handleContact(input: ContactInput, env: Env): Promise<{ sent: boolean }> {
  // Bot signals get a normal-looking success so scripts learn nothing, but no email is sent.
  if (input.website) return { sent: true };
  if (typeof input.elapsedMs === "number" && input.elapsedMs < MIN_FILL_MS) return { sent: true };
  if (typeof input.message !== "string" || input.message.trim().length < 5) {
    throw new InvalidLeadError("Please describe what you want to improve.");
  }
  const lead = normalizeLead({ ...input, source: "website-contact" });
  if (await isRepeatSubmission(env.LEADS, lead)) return { sent: true };
  const need = NEED_LABELS[input.need ?? ""] ?? "Chưa chọn";
  const duplicate = await isDuplicate(env.LEADS, lead);
  const score = await scoreLead(lead, env.ANTHROPIC_API_KEY);
  const { subject, text } = contactEmail(lead, score, need, duplicate, input.page);
  await sendWithResend(env, env.CONTACT_TO ?? DEFAULT_CONTACT_TO, subject, text, lead.email);
  await forwardLead(lead, score, { hubspotToken: env.HUBSPOT_TOKEN, n8nUrl: env.N8N_WEBHOOK_URL });
  return { sent: true };
}
