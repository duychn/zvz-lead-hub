import type { ForwardResult, Lead, Score } from "./types";

/** Creates a HubSpot contact using only standard properties, so no portal setup is needed. */
async function toHubSpot(lead: Lead, token: string): Promise<ForwardResult> {
  const [firstname, ...rest] = lead.name.split(" ").reverse();
  const properties: Record<string, string> = { firstname: firstname ?? lead.name, hs_lead_status: "NEW" };
  if (rest.length) properties.lastname = rest.reverse().join(" ");
  if (lead.email) properties.email = lead.email;
  if (lead.phone) properties.phone = lead.phone;
  if (lead.company) properties.company = lead.company;
  const res = await fetch("https://api.hubapi.com/crm/v3/objects/contacts", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ properties }),
  });
  return { destination: "hubspot", ok: res.ok, status: res.status };
}

/** Sends the scored lead to an n8n (or Make) webhook for the team's own workflow. */
async function toN8n(lead: Lead, score: Score, url: string): Promise<ForwardResult> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ lead, score }),
  });
  return { destination: "n8n", ok: res.ok, status: res.status };
}

export async function forwardLead(
  lead: Lead,
  score: Score,
  targets: { hubspotToken?: string; n8nUrl?: string },
): Promise<ForwardResult[]> {
  const jobs: Promise<ForwardResult>[] = [];
  if (targets.hubspotToken) jobs.push(toHubSpot(lead, targets.hubspotToken));
  if (targets.n8nUrl) jobs.push(toN8n(lead, score, targets.n8nUrl));
  return Promise.all(jobs);
}
