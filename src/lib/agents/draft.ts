import { azureChat } from "@/lib/llm/azure";
import { RawProspect } from "@/lib/agents/discovery";
import { EnrichedSources } from "@/lib/agents/enrich";

export interface DraftResult {
  channel: "email" | "linkedin_dm" | "twitter_reply";
  subject: string;
  body: string;
  citation: string;
}

export async function generateDraft(
  prospect: RawProspect,
  sources: EnrichedSources,
  companyPitch: string
): Promise<DraftResult> {
  const system = `You are an expert B2B sales copywriter. Write a personalized cold outreach email using the AIDA framework (Attention, Interest, Desire, Action).
Rules:
- Cite a SPECIFIC signal found during research (post, tweet, job opening, or company news)
- Keep it under 150 words
- Be direct, no fluff
- End with a clear CTA (15-min call or reply)

Return ONLY valid JSON:
{
  "channel": "email",
  "subject": "<compelling subject line>",
  "body": "<full email body>",
  "citation": "<exact signal you used, e.g. 'Posted about hiring challenges on LinkedIn 3 days ago'>"
}`;

  const user = `Sender company: ${companyPitch}
Prospect: ${JSON.stringify({ ...prospect, sources })}`;

  const raw = await azureChat(system, user);
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON found");
    return JSON.parse(match[0]) as DraftResult;
  } catch {
    return {
      channel: "email",
      subject: `Quick question for ${prospect.name}`,
      body: raw,
      citation: "N/A",
    };
  }
}
