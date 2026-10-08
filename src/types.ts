// Shared shapes for the lead pipeline: intake → normalize → dedupe → score → forward.

export interface Env {
  /** KV namespace used only to remember lead fingerprints for de-duplication. */
  LEADS: KVNamespace;
  /** Rate limiter for the public demo endpoint. */
  DEMO_LIMITER?: RateLimit;
  /** Stricter rate limiter for the website contact form. */
  CONTACT_LIMITER?: RateLimit;
  /** Sends contact-form notifications; without it POST /v1/contact returns 503. */
  RESEND_API_KEY?: string;
  /** Overrides for the notification recipient and sender (sender domain must be verified in Resend). */
  CONTACT_TO?: string;
  CONTACT_FROM?: string;
  /** Bearer token required by POST /v1/leads. */
  INTAKE_TOKEN?: string;
  /** Enables Claude scoring; without it the rule-based scorer is used. */
  ANTHROPIC_API_KEY?: string;
  /** Optional destinations. Each one is skipped when unset. */
  HUBSPOT_TOKEN?: string;
  N8N_WEBHOOK_URL?: string;
  /** Meta Lead Ads webhook settings. */
  META_VERIFY_TOKEN?: string;
  META_APP_SECRET?: string;
  META_PAGE_TOKEN?: string;
}

/** Raw lead as received from a form, an API client or Meta Lead Ads. */
export interface IncomingLead {
  name?: string;
  phone?: string;
  email?: string;
  company?: string;
  message?: string;
  source?: string;
  campaign?: string;
}

export interface Lead {
  name: string;
  phone: string | null;
  email: string | null;
  company: string | null;
  message: string;
  source: string;
  campaign: string | null;
  receivedAt: string;
}

export type Tier = "hot" | "warm" | "review";

export interface Score {
  score: number;
  tier: Tier;
  reason: string;
  scorer: "claude" | "rules";
}

export interface ForwardResult {
  destination: "hubspot" | "n8n";
  ok: boolean;
  status: number;
}
