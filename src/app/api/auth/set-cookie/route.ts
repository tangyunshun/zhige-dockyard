﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { token, maxAge, rememberMe } = await request.json();

    if (!token) {
      return NextResponse.json(
        { error: "Token is required" },
        { status: 400 },
      );
    }

    // 鍒涘缓鍝嶅簲骞惰缃?cookie
    const response = NextResponse.json({ success: true });
    
    response.cookies.set("auth_token", token, {
      path: "/",
      maxAge: maxAge || 24 * 60 * 60, // 榛樿 1 澶?      httpOnly: false, // 鍏佽瀹㈡埛绔?JavaScript 璁块棶
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });

    return response;
  } catch (error) {
    console.error("Set cookie error:", error);
    return NextResponse.json(
      { error: "璁剧疆 cookie 澶辫触" },
      { status: 500 },
    );
  }
}