import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ObjectId } from "mongodb";
import { discoverProspects } from "@/lib/agents/discovery";
import { enrichProspect } from "@/lib/agents/enrich";
import { scoreProspect } from "@/lib/agents/score";

async function runPipeline(runId: string, icpId: string) {
  const db = await getDb();
  try {
    await db.collection("runs").updateOne({ _id: new ObjectId(runId) }, { $set: { status: "running" } });

    const icpDoc = await db.collection("icps").findOne({ _id: new ObjectId(icpId) });
    if (!icpDoc) throw new Error("ICP not found");

    const { icp, company_pitch, sources_enabled } = icpDoc;

    // Step 1: discover
    await addLog(db, runId, "discovery", "Starting prospect discovery...");
    const rawProspects = await discoverProspects(icp, company_pitch);
    await addLog(db, runId, "discovery", `Found ${rawProspects.length} prospects`);

    // Step 2: enrich + score each prospect
    for (const prospect of rawProspects) {
      const prospectDoc = {
        run_id: runId,
        ...prospect,
        enrichment_status: "pending",
        sources: {},
        created_at: new Date(),
        updated_at: new Date(),
      };
      const inserted = await db.collection("prospects").insertOne(prospectDoc);
      const prospectId = inserted.insertedId.toString();

      await addLog(db, runId, "enrich", `Enriching ${prospect.name}...`);
      await db.collection("prospects").updateOne(
        { _id: inserted.insertedId },
        { $set: { enrichment_status: "running", updated_at: new Date() } }
      );

      const enriched = await enrichProspect(prospect, sources_enabled);

      await db.collection("prospects").updateOne(
        { _id: inserted.insertedId },
        { $set: { sources: enriched, enrichment_status: "scoring", updated_at: new Date() } }
      );

      await addLog(db, runId, "score", `Scoring ${prospect.name}...`);
      const scoreResult = await scoreProspect(prospect, enriched, icp);

      await db.collection("prospects").updateOne(
        { _id: inserted.insertedId },
        {
          $set: {
            ...scoreResult,
            enrichment_status: "completed",
            updated_at: new Date(),
          },
        }
      );
      await addLog(db, runId, "score", `${prospect.name} scored ${scoreResult.score} (${scoreResult.tag})`);
      void prospectId;
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
  const { icp_id } = await req.json();
  if (!icp_id) return NextResponse.json({ error: "icp_id required" }, { status: 400 });

  const db = await getDb();
  const run = {
    icp_id,
    status: "pending",
    started_at: new Date(),
    log: [],
  };
  const result = await db.collection("runs").insertOne(run);
  const runId = result.insertedId.toString();

  // fire and forget
  setImmediate(() => runPipeline(runId, icp_id));

  return NextResponse.json({ run_id: runId, status: "pending" });
}

export async function GET() {
  const db = await getDb();
  const runs = await db.collection("runs").find().sort({ started_at: -1 }).limit(20).toArray();
  return NextResponse.json(runs);
}
