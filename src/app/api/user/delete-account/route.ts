﻿﻿﻿﻿﻿﻿﻿﻿﻿import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// DELETE - 删除账户
export async function DELETE(req: NextRequest) {
  try {
    const userId = req.headers.get("Authorization")?.replace("Bearer ", "");

    if (!userId) {
      return NextResponse.json(
        { error: "未授权" },
        { status: 401 }
      );
    }

    // 验证用户是否存在
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return NextResponse.json(
        { error: "用户不存在" },
        { status: 404 }
      );
    }

    // 删除用户账户
    // 注意：这里应该先处理关联数据
    // 实际应用中需要考虑外键约束和数据完整性
    
    await prisma.user.delete({
      where: { id: userId },
    });

    return NextResponse.json({
      success: true,
      message: "账户已删除",
    });
  } catch (error) {
    console.error("Delete user account error:", error);
    return NextResponse.json(
      { error: "删除账户失败" },
      { status: 500 }
    );
  }
}
