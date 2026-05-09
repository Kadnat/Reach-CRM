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

type PartialWebData = EnrichedSources["web"];

export async function enrichProspect(
  prospect: RawProspect,
  _sources: string[],
  onProgress?: (source: string, status: "running" | "done" | "error") => void,
  onPartialData?: (partial: PartialWebData) => Promise<void>
): Promise<EnrichedSources> {
  onProgress?.("web", "running");
  const merged: PartialWebData = {};

  try {
    // Mini-tâche 1 — profil de base (rôle, résumé, infos société)
    const basic = await runMiniTask(prospect, buildBasicTask(prospect.name ?? "", prospect.company ?? ""), "basic");
    Object.assign(merged, basic);
    await onPartialData?.(merged);

    // Mini-tâche 2 — recherche email/contact
    const contact = await runMiniTask(prospect, buildContactTask(prospect.name ?? "", prospect.company ?? ""), "contact");
    if (contact?.email) merged.email = contact.email;
    if (contact?.phone) merged.phone = contact.phone;
    await onPartialData?.(merged);

    // Mini-tâche 3 — actualités / mentions récentes
    const news = await runMiniTask(prospect, buildNewsTask(prospect.name ?? "", prospect.company ?? ""), "news");
    if (news?.recent_mentions?.length) merged.recent_mentions = news.recent_mentions;
    await onPartialData?.(merged);

    onProgress?.("web", "done");
    return { web: merged };
  } catch (err) {
    console.error("[enrich error]", err);
    onProgress?.("web", "error");
    return { web: merged };
  }
}

async function runMiniTask(
  _prospect: RawProspect,
  task: string,
  label: string,
  retries = 2
): Promise<PartialWebData> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const session = await createSession();
    try {
      await navigateTo(session.sessionId, "https://www.google.com");
      const raw = await runCuaOnKernel(session.sessionId, task);
      console.log(`[enrich:${label}]`, raw?.slice(0, 300));

      // Bot/Cloudflare wall → nouvelle session
      if (raw?.includes('"bot_detected"')) {
        console.warn(`[enrich:${label}] wall detected attempt ${attempt + 1}, retrying...`);
        await deleteSession(session.sessionId).catch(() => null);
        continue;
      }

      return parseJson<PartialWebData>(raw, {});
    } catch (err) {
      console.error(`[enrich:${label} error] attempt ${attempt + 1}:`, String(err));
      await deleteSession(session.sessionId).catch(() => null);
      continue;
    } finally {
      await deleteSession(session.sessionId).catch(() => null);
    }
  }
  return {};
}

function buildBasicTask(name: string, company: string): string {
  return `You are a B2B web scraper. Your job: find professional info about a person by scraping as many public pages as possible.
Target: ${name} — ${company}

CRITICAL RULES:
- NEVER go to linkedin.com (login wall).
- If you hit a CAPTCHA, Cloudflare wall, or any access block: output {"bot_detected": true} immediately. Do NOT try to solve it.
- After typing in any box, press Enter.
- You have 15 actions max. Scrape fast and wide.

STEP 1 — Search: click the search box, type "${name} ${company}", press Enter.
STEP 2 — Visit 2-3 results: company team page, press articles, personal website, blog. Read and extract everything.
STEP 3 — Output JSON now (no markdown, no code block):
{
  "name": "${name}",
  "role": "exact job title or null",
  "company": "${company}",
  "company_about": "what the company does in 1-2 sentences or null",
  "summary": "professional bio 2-3 sentences from what you scraped or null",
  "recent_mentions": ["any relevant activity, event, article found"]
}`;
}

function buildContactTask(name: string, company: string): string {
  return `You are a B2B web scraper. Your job: find any public contact info for this person.
Target: ${name} — ${company}

CRITICAL RULES:
- NEVER go to linkedin.com (login wall).
- If you hit a CAPTCHA, Cloudflare wall, or any access block: output {"bot_detected": true} immediately. Do NOT try to solve it.
- After typing in any box, press Enter.
- You have 12 actions max. Scrape fast.

STEP 1 — Search: type "${name} ${company} email", press Enter. Scan snippets for email addresses.
STEP 2 — Search: type "${name} ${company} contact", press Enter. Visit the company contact page if visible.
STEP 3 — Output JSON now (no markdown):
{
  "email": "email@domain.com or null",
  "phone": "+33... or null"
}`;
}

function buildNewsTask(name: string, company: string): string {
  return `You are a B2B web scraper. Your job: find any public mentions, activities or press about this person.
Target: ${name} — ${company}

CRITICAL RULES:
- NEVER go to linkedin.com (login wall).
- If you hit a CAPTCHA, Cloudflare wall, or any access block: output {"bot_detected": true} immediately. Do NOT try to solve it.
- After typing in any box, press Enter.
- You have 12 actions max. Scrape fast and wide.

STEP 1 — Search: type "${name} ${company}", press Enter. Look for press articles, interviews, events, podcasts in results.
STEP 2 — Search: type "${name} site:crunchbase.com OR site:maddyness.com OR site:bfmtv.com OR site:lesechos.fr", press Enter. Scrape any relevant result.
STEP 3 — Output JSON now (no markdown):
{
  "recent_mentions": ["specific mention 1", "specific mention 2", "specific mention 3"]
}`;
}

function parseJson<T>(raw: string, fallback: T): T {
  try {
    const match = raw?.match(/\{[\s\S]*\}/);
    if (!match) return fallback;
    return JSON.parse(match[0]) as T;
  } catch {
    return fallback;
  }
}
