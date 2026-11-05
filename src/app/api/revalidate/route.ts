import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

/**
 * On-demand refresh of every cached store page. Off unless REVALIDATE_SECRET
 * is set. Call with: POST /api/revalidate and header x-revalidate-secret.
 */
export async function POST(req: NextRequest) {
  const secret = env.REVALIDATE_SECRET;
  const given = req.headers.get("x-revalidate-secret") ?? "";
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) {
    return new NextResponse("Not found", { status: 404 });
  }
  revalidatePath("/", "layout");
  return NextResponse.json({ revalidated: true });
}
