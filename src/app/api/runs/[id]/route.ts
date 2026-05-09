import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ObjectId } from "mongodb";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const run = await db.collection("runs").findOne({ _id: new ObjectId(id) });
  if (!run) return NextResponse.json({ error: "not found" }, { status: 404 });
  const prospects = await db.collection("prospects").find({ run_id: id }).toArray();
  return NextResponse.json({ run, prospects });
}
