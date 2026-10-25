import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ success: true, message: "Endpoint deprecated and retired." }, { status: 404 });
}
