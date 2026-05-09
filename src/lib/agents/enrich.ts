import { createSession, deleteSession, navigateTo, runCuaOnKernel } from "@/lib/cua/kernel";
import { RawProspect } from "@/lib/agents/discovery";

export interface EnrichedSources {
  web?: {
    name?: string;
    role?: string;
    company?: string;
    company_about?: string;
    email?: string | null;
    phone?: string | null;
    summary?: string;
    recent_mentions?: string[];
  };
}

const MAX_SESSION_RETRIES = 3;

export async function enrichProspect(
  prospect: RawProspect,
  _sources: string[],
  onProgress?: (source: string, status: "running" | "done" | "error") => void
): Promise<EnrichedSources> {
  onProgress?.("web", "running");
  try {
    const result = await enrichViaWebResearch(prospect);
    onProgress?.("web", "done");
    return { web: result };
  } catch {
    onProgress?.("web", "error");
    return {};
  }
}

async function enrichViaWebResearch(prospect: RawProspect): Promise<EnrichedSources["web"]> {
  const fallback = { summary: "", company_about: "", recent_mentions: [] };
  const name = prospect.name ?? "Unknown";
  const company = prospect.company ?? "";

  for (let attempt = 0; attempt < MAX_SESSION_RETRIES; attempt++) {
    const session = await createSession();
    try {
      await navigateTo(session.sessionId, "https://www.google.com");
      const task = buildResearchTask(name, company);
      const raw = await runCuaOnKernel(session.sessionId, task);
      console.log("[enrich web raw]", raw?.slice(0, 600));

      // Bot Google détecté → nouvelle session
      if (raw?.includes('"bot_detected"')) {
        console.warn(`[enrich] Bot wall detected (attempt ${attempt + 1}), retrying with new session...`);
        await deleteSession(session.sessionId).catch(() => null);
        continue;
      }

      return parseJson(raw, fallback);
    } catch (err) {
      console.error(`[enrich web error] attempt ${attempt + 1}:`, String(err));
    } finally {
      await deleteSession(session.sessionId).catch(() => null);
    }
  }

  return fallback;
}

function buildResearchTask(name: string, company: string): string {
  return `You are an expert B2B researcher. Gather ALL possible public information about this person.
Name: ${name}
Company: ${company}

CRITICAL RULES:
- NEVER go to linkedin.com (requires login).
- If you see a Google CAPTCHA, "unusual traffic", or any bot-detection page, immediately stop and output ONLY: {"bot_detected": true}
- If you find an email or phone number anywhere, capture it.
- After typing in any search box or address bar, press the Enter key to confirm.
- You have at most 25 browser actions. After step 3, output the JSON immediately even if partial.
- When ready to output results, stop taking actions and output ONLY the JSON — nothing else.

STEP 1 — Click the Google search box, type "${name} ${company}", then press Enter to search.
Read snippets + visit 2-3 top results (team page, press, blog).

STEP 2 — Go back to Google (address bar → type google.com → Enter). Search for "${company}" → visit the official website → About/Team/Blog pages.

STEP 3 — Go back to Google. Search for "${name} email contact ${company}" and press Enter. Look for any public email address in results.

STEP 4 — Search for "${name} interview conference podcast" and press Enter. Visit any relevant result.

STEP 5 — When done, return ONLY this JSON (no markdown, no code block):
{
  "name": "${name}",
  "role": "their exact job title",
  "company": "${company}",
  "company_about": "what the company does in 1-2 sentences",
  "email": "public email if found, else null",
  "phone": "public phone if found, else null",
  "summary": "professional summary 2-3 sentences",
  "recent_mentions": ["source/activity 1", "source/activity 2", "source/activity 3"]
}`;
}

function parseJson<T>(raw: string, fallback: T): T {
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return fallback;
    return JSON.parse(match[0]) as T;
  } catch {
    return fallback;
  }
}
