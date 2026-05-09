import { runCuaTask } from "@/lib/cua/tzafon";
import { RawProspect } from "@/lib/agents/discovery";

export interface EnrichedSources {
  linkedin?: { bio: string; last_posts: string[]; last_activity?: string };
  twitter?: { bio: string; last_tweets: string[] };
  website?: { about: string; tech_stack: string[]; open_positions: string[] };
}

export async function enrichProspect(
  prospect: RawProspect,
  sources: string[]
): Promise<EnrichedSources> {
  const tasks: Promise<[string, unknown]>[] = [];

  if (sources.includes("linkedin") && prospect.linkedin_url) {
    tasks.push(enrichLinkedIn(prospect).then((d) => ["linkedin", d]));
  }
  if (sources.includes("twitter")) {
    tasks.push(enrichTwitter(prospect).then((d) => ["twitter", d]));
  }
  if (sources.includes("website") && prospect.website_url) {
    tasks.push(enrichWebsite(prospect).then((d) => ["website", d]));
  }

  const results = await Promise.allSettled(tasks);
  const enriched: EnrichedSources = {};
  for (const r of results) {
    if (r.status === "fulfilled") {
      const [key, data] = r.value;
      (enriched as Record<string, unknown>)[key] = data;
    }
  }
  return enriched;
}

async function enrichLinkedIn(p: RawProspect) {
  const instruction = `Go to ${p.linkedin_url}. Extract:
1. Bio/headline
2. Last 3 posts (text summary)
3. Last activity date
Return JSON: {"bio": "...", "last_posts": ["...", "...", "..."], "last_activity": "..."}
Return ONLY the JSON.`;
  const raw = await runCuaTask(instruction);
  return parseJson(raw, { bio: "", last_posts: [] });
}

async function enrichTwitter(p: RawProspect) {
  const instruction = `Search Twitter/X for "${p.name} ${p.company}" to find their profile. Extract:
1. Bio
2. Last 3 tweets (text summary)
Return JSON: {"bio": "...", "last_tweets": ["...", "...", "..."]}
Return ONLY the JSON.`;
  const raw = await runCuaTask(instruction);
  return parseJson(raw, { bio: "", last_tweets: [] });
}

async function enrichWebsite(p: RawProspect) {
  const instruction = `Go to ${p.website_url}. Extract:
1. About / mission
2. Tech stack clues (from footer, careers page, or about page)
3. Open job positions (titles only)
Return JSON: {"about": "...", "tech_stack": ["..."], "open_positions": ["..."]}
Return ONLY the JSON.`;
  const raw = await runCuaTask(instruction);
  return parseJson(raw, { about: "", tech_stack: [], open_positions: [] });
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
