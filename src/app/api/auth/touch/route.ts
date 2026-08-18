import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const userId = request.headers.get("x-user-id");
  
  if (!userId) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  return NextResponse.json({
    success: true,
    serverTime: new Date().toISOString(),
  });
}
