import { isDuplicate } from "./dedupe";
import { forwardLead } from "./forward";
import { InvalidLeadError, normalizeLead } from "./normalize";
import { scoreLead } from "./score";
import type { Env, IncomingLead, Lead, Score } from "./types";

/** Contact-form submission from zvzdigital.com. `website` is a honeypot real visitors never fill. */
export interface ContactInput extends IncomingLead {
  need?: string;
  website?: string;
  page?: string;
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
  if (input.website) return { sent: true }; // Honeypot hit: pretend success, send nothing.
  if (typeof input.message !== "string" || input.message.trim().length < 5) {
    throw new InvalidLeadError("Please describe what you want to improve.");
  }
  const lead = normalizeLead({ ...input, source: "website-contact" });
  const need = NEED_LABELS[input.need ?? ""] ?? "Chưa chọn";
  const duplicate = await isDuplicate(env.LEADS, lead);
  const score = await scoreLead(lead, env.ANTHROPIC_API_KEY);
  const { subject, text } = contactEmail(lead, score, need, duplicate, input.page);
  await sendWithResend(env, env.CONTACT_TO ?? DEFAULT_CONTACT_TO, subject, text, lead.email);
  await forwardLead(lead, score, { hubspotToken: env.HUBSPOT_TOKEN, n8nUrl: env.N8N_WEBHOOK_URL });
  return { sent: true };
}
