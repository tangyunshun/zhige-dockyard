import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { token, maxAge, rememberMe } = await request.json();

    if (!token) {
      return NextResponse.json(
        { error: "Token is required" },
        { status: 400 },
      );
    }

    // 创建响应并设置 cookie
    const response = NextResponse.json({ success: true });
    
    response.cookies.set("auth_token", token, {
      path: "/",
      maxAge: maxAge || 24 * 60 * 60, // 默认 1 天
      httpOnly: false, // 允许客户端 JavaScript 访问
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });

    return response;
  } catch (error) {
    console.error("Set cookie error:", error);
    return NextResponse.json(
      { error: "设置 cookie 失败" },
      { status: 500 },
    );
  }
}
