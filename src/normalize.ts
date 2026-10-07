import type { IncomingLead, Lead } from "./types";

const MAX = { name: 100, email: 150, company: 150, message: 2000, source: 50, campaign: 150 };

const clean = (value: unknown, max: number): string =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";

/**
 * Normalizes a Vietnamese phone number to E.164 (+84…).
 * Accepts 0xxxxxxxxx, 84xxxxxxxxx and +84xxxxxxxxx with spaces, dots or dashes.
 * Returns null when the result is not a 9-digit national number after the prefix.
 */
export function normalizePhoneVN(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) digits = digits.slice(1);
  if (digits.startsWith("84")) digits = digits.slice(2);
  else if (digits.startsWith("0")) digits = digits.slice(1);
  return /^[35789]\d{8}$/.test(digits) ? `+84${digits}` : null;
}

export function normalizeEmail(raw: unknown): string | null {
  const email = clean(raw, MAX.email).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export class InvalidLeadError extends Error {}

/** Builds a clean lead or throws when there is no way to contact the person. */
export function normalizeLead(input: IncomingLead, now = new Date()): Lead {
  const phone = normalizePhoneVN(input.phone);
  const email = normalizeEmail(input.email);
  if (!phone && !email) throw new InvalidLeadError("A valid Vietnamese phone number or email is required.");
  return {
    name: clean(input.name, MAX.name) || "Chưa rõ tên",
    phone,
    email,
    company: clean(input.company, MAX.company) || null,
    message: clean(input.message, MAX.message),
    source: clean(input.source, MAX.source).toLowerCase() || "website",
    campaign: clean(input.campaign, MAX.campaign) || null,
    receivedAt: now.toISOString(),
  };
}
