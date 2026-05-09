import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ObjectId } from "mongodb";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const prospect = await db.collection("prospects").findOne({ _id: new ObjectId(id) });
  if (!prospect) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(prospect);
}
