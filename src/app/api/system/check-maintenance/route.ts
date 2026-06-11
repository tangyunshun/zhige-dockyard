﻿import { NextRequest, NextResponse } from "next/server";
import { isInMaintenance } from "../maintenance/route";

/**
 * 检查系统是否处于维护模式
 */
export async function GET(request: NextRequest) {
  const check = isInMaintenance();

  return NextResponse.json({
    inMaintenance: check.inMaintenance,
    message: check.message,
    timestamp: new Date().toISOString(),
  });
}