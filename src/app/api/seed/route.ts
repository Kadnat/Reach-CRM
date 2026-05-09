import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ObjectId } from "mongodb";
import { buildIcp, ICP } from "@/lib/agents/icp";
import { enrichProspect } from "@/lib/agents/enrich";
import { scoreProspect } from "@/lib/agents/score";
import { discoverProspects, RawProspect } from "@/lib/agents/discovery";

async function enrichAndScore(
  db: Awaited<ReturnType<typeof getDb>>,
  runId: string,
  icp: ICP,
  prospect: RawProspect
) {
  const inserted = await db.collection("prospects").insertOne({
    run_id: runId,
    ...prospect,
    enrichment_status: "pending",
    sources: {},
    created_at: new Date(),
    updated_at: new Date(),
  });

  await addLog(db, runId, "enrich", `Enriching ${prospect.name}...`);
  await db.collection("prospects").updateOne(
    { _id: inserted.insertedId },
    { $set: { enrichment_status: "running", updated_at: new Date() } }
  );

  const enriched = await enrichProspect(
    prospect,
    ["web"],
    (source, status) => {
      addLog(db, runId, "enrich", `${prospect.name} — ${source}: ${status}`);
    },
    async (partial) => {
      await db.collection("prospects").updateOne(
        { _id: inserted.insertedId },
        { $set: { "sources.web": partial, updated_at: new Date() } }
      );
    }
  );

  await db.collection("prospects").updateOne(
    { _id: inserted.insertedId },
    { $set: { sources: enriched, enrichment_status: "scoring", updated_at: new Date() } }
  );

  const scoreResult = await scoreProspect(prospect, enriched, icp);
  await db.collection("prospects").updateOne(
    { _id: inserted.insertedId },
    { $set: { ...scoreResult, enrichment_status: "completed", updated_at: new Date() } }
  );
  await addLog(db, runId, "score", `${prospect.name}: ${scoreResult.score}/100 (${scoreResult.tag})`);
}

async function runSeedPipeline(runId: string, icpId: string, seedProspects: RawProspect[]) {
  const db = await getDb();
  try {
    await db.collection("runs").updateOne(
      { _id: new ObjectId(runId) },
      { $set: { status: "running" } }
    );

    const icpDoc = await db.collection("icps").findOne({ _id: new ObjectId(icpId) });
    if (!icpDoc) throw new Error("ICP not found");
    const { icp, company_pitch } = icpDoc as unknown as { icp: ICP; company_pitch: string };

    // Phase 1 — Enrichir les seeds
    await addLog(db, runId, "seed", `Phase 1: enriching ${seedProspects.length} seed prospects via web research...`);
    for (const prospect of seedProspects) {
      await enrichAndScore(db, runId, icp, prospect);
    }

    // Phase 2 — Découvrir des profils similaires
    await addLog(db, runId, "discovery", `Phase 2: discovering similar profiles...`);
    const discovered = await discoverProspects(icp, company_pitch ?? "", (msg) =>
      addLog(db, runId, "discovery", msg)
    );

    const seedUrls = new Set(seedProspects.map((p) => p.linkedin_url).filter(Boolean));
    const seedNames = new Set(seedProspects.map((p) => p.name?.toLowerCase()));
    const newProspects = discovered
      .filter((p) => !seedUrls.has(p.linkedin_url) && !seedNames.has(p.name?.toLowerCase()))
      .slice(0, 3);

    await addLog(db, runId, "discovery", `Found ${newProspects.length} similar profiles to enrich`);
    for (const prospect of newProspects) {
      await enrichAndScore(db, runId, icp, prospect);
    }

    await db.collection("runs").updateOne(
      { _id: new ObjectId(runId) },
      { $set: { status: "done", finished_at: new Date() } }
    );
  } catch (err) {
    await db.collection("runs").updateOne(
      { _id: new ObjectId(runId) },
      { $set: { status: "error", error: String(err), finished_at: new Date() } }
    );
  }
}

async function addLog(db: Awaited<ReturnType<typeof getDb>>, runId: string, level: string, msg: string) {
  await db.collection("runs").updateOne(
    { _id: new ObjectId(runId) },
    { $push: { log: { ts: new Date(), level, msg } as never } }
  );
}

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    pitch: string;
    // Accepte soit des URLs LinkedIn, soit des objets {name, company, role?, linkedin_url?}
    linkedin_urls?: string[];
    prospects?: Array<{ name: string; company: string; role?: string; linkedin_url?: string }>;
  };

  const { pitch } = body;
  if (!pitch) {
    return NextResponse.json({ error: "pitch required" }, { status: 400 });
  }

  // Construire la liste de prospects depuis les deux formats possibles
  let prospects: RawProspect[] = [];
  if (body.prospects?.length) {
    prospects = body.prospects.map((p) => ({
      name: p.name,
      company: p.company,
      role: p.role ?? "Unknown",
      linkedin_url: p.linkedin_url,
    }));
  } else if (body.linkedin_urls?.length) {
    prospects = body.linkedin_urls.map((url) => ({
      name: url.split("/in/")[1]?.replace(/\//g, "") ?? "Unknown",
      company: "Unknown",
      role: "Unknown",
      linkedin_url: url,
    }));
  }

  if (!prospects.length) {
    return NextResponse.json({ error: "prospects or linkedin_urls required" }, { status: 400 });
  }

  const db = await getDb();
  const icpResult = await buildIcp(pitch);
  const icpInserted = await db.collection("icps").insertOne({
    ...icpResult,
    company_pitch: pitch,
    sources_enabled: ["web"],
    created_at: new Date(),
  });

  const runInserted = await db.collection("runs").insertOne({
    icp_id: icpInserted.insertedId.toString(),
    status: "pending",
    started_at: new Date(),
    log: [],
  });

  const runId = runInserted.insertedId.toString();
  const icpId = icpInserted.insertedId.toString();

  setImmediate(() => runSeedPipeline(runId, icpId, prospects));

  return NextResponse.json({ run_id: runId, icp_id: icpId, prospects_queued: prospects.length });
}
