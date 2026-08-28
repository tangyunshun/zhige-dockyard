import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ message: "API endpoint moved to /api/workspace/dissolve-check" });
}
