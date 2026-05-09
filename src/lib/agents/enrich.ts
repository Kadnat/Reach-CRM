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
  label: string
): Promise<PartialWebData> {
  const session = await createSession();
  try {
    await navigateTo(session.sessionId, "https://www.google.com");
    const raw = await runCuaOnKernel(session.sessionId, task);
    console.log(`[enrich:${label}]`, raw?.slice(0, 300));

    if (raw?.includes('"bot_detected"')) {
      console.warn(`[enrich:${label}] bot wall, skipping`);
      return {};
    }

    return parseJson<PartialWebData>(raw, {});
  } catch (err) {
    console.error(`[enrich:${label} error]`, String(err));
    return {};
  } finally {
    await deleteSession(session.sessionId).catch(() => null);
  }
}

function buildBasicTask(name: string, company: string): string {
  return `You are a B2B researcher. Find basic professional information about this person.
Name: ${name} | Company: ${company}

RULES:
- NEVER go to linkedin.com.
- If you see a Google CAPTCHA or bot-detection page, output ONLY: {"bot_detected": true}
- You have at most 12 browser actions total. Be efficient.
- After typing in a search box or address bar, press Enter.

STEP 1 — Click the search box, type "${name} ${company}", press Enter.
STEP 2 — Read the search result snippets. Visit 1 promising result (team page or company website).
STEP 3 — Output this JSON immediately (no markdown):
{
  "name": "${name}",
  "role": "job title or null",
  "company": "${company}",
  "company_about": "what the company does in 1-2 sentences or null",
  "summary": "2-3 sentence professional bio or null",
  "recent_mentions": []
}`;
}

function buildContactTask(name: string, company: string): string {
  return `You are a B2B researcher. Find contact information for this person.
Name: ${name} | Company: ${company}

RULES:
- NEVER go to linkedin.com.
- If you see a Google CAPTCHA or bot-detection page, output ONLY: {"bot_detected": true}
- You have at most 10 browser actions. Be efficient.
- After typing in a search box, press Enter.

STEP 1 — Click the search box, type "${name} ${company} email contact", press Enter.
STEP 2 — Scan results for any public email address or phone number.
STEP 3 — Output this JSON immediately (no markdown):
{
  "email": "email@domain.com or null",
  "phone": "phone number or null"
}`;
}

function buildNewsTask(name: string, company: string): string {
  return `You are a B2B researcher. Find recent public activities or mentions of this person.
Name: ${name} | Company: ${company}

RULES:
- NEVER go to linkedin.com.
- If you see a Google CAPTCHA or bot-detection page, output ONLY: {"bot_detected": true}
- You have at most 10 browser actions. Be efficient.
- After typing in a search box, press Enter.

STEP 1 — Click the search box, type "${name} interview OR conference OR podcast OR article 2024 2025", press Enter.
STEP 2 — Read the result snippets for relevant mentions.
STEP 3 — Output this JSON immediately (no markdown):
{
  "recent_mentions": ["mention 1", "mention 2", "mention 3"]
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
