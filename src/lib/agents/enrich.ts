import { createSession, deleteSession, runCuaOnKernel } from "@/lib/cua/kernel";
import { RawProspect } from "@/lib/agents/discovery";

export interface EnrichedSources {
  linkedin?: { bio: string; last_posts: string[]; last_activity?: string };
  twitter?: { bio: string; last_tweets: string[] };
  website?: { about: string; tech_stack: string[]; open_positions: string[] };
}

export async function enrichProspect(
  prospect: RawProspect,
  sources: string[],
  onProgress?: (source: string, status: "running" | "done" | "error") => void
): Promise<EnrichedSources> {
  // One KERNEL session per source, run in parallel
  const tasks: Promise<[string, unknown]>[] = [];

  if (sources.includes("linkedin") && prospect.linkedin_url) {
    tasks.push(
      enrichWithKernel(
        `Go to ${prospect.linkedin_url}. Extract bio/headline, last 3 posts summaries, last activity date.
Return ONLY JSON: {"bio": "...", "last_posts": ["...", "...", "..."], "last_activity": "..."}`,
        { bio: "", last_posts: [] },
        () => onProgress?.("linkedin", "running"),
        () => onProgress?.("linkedin", "done"),
        (e) => onProgress?.("linkedin", "error")
      ).then((d) => ["linkedin", d])
    );
  }

  if (sources.includes("twitter")) {
    tasks.push(
      enrichWithKernel(
        `Go to twitter.com and search for "${prospect.name} ${prospect.company}". Find their profile.
Extract bio and last 3 tweet summaries.
Return ONLY JSON: {"bio": "...", "last_tweets": ["...", "...", "..."]}`,
        { bio: "", last_tweets: [] },
        () => onProgress?.("twitter", "running"),
        () => onProgress?.("twitter", "done"),
        (e) => onProgress?.("twitter", "error")
      ).then((d) => ["twitter", d])
    );
  }

  if (sources.includes("website") && prospect.website_url) {
    tasks.push(
      enrichWithKernel(
        `Go to ${prospect.website_url}. Extract: about/mission text, tech stack clues, open job positions.
Return ONLY JSON: {"about": "...", "tech_stack": ["..."], "open_positions": ["..."]}`,
        { about: "", tech_stack: [], open_positions: [] },
        () => onProgress?.("website", "running"),
        () => onProgress?.("website", "done"),
        (e) => onProgress?.("website", "error")
      ).then((d) => ["website", d])
    );
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

async function enrichWithKernel<T>(
  task: string,
  fallback: T,
  onStart: () => void,
  onDone: () => void,
  onError: (e: unknown) => void
): Promise<T> {
  const session = await createSession();
  onStart();
  try {
    const raw = await runCuaOnKernel(session.sessionId, task);
    onDone();
    return parseJson(raw, fallback);
  } catch (err) {
    onError(err);
    return fallback;
  } finally {
    await deleteSession(session.sessionId).catch(() => null);
  }
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
