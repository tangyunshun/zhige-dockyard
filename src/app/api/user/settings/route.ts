import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const STORE_PATH = path.join(process.cwd(), "src/app/api/user/settings/settings-store.json");

function readStore() {
  try {
    if (fs.existsSync(STORE_PATH)) {
      const data = fs.readFileSync(STORE_PATH, "utf-8");
      return JSON.parse(data);
    }
  } catch (error) {
    console.error("Error reading settings store:", error);
  }
  return {};
}

function writeStore(store: Record<string, any>) {
  try {
    const dir = path.dirname(STORE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), "utf-8");
  } catch (error) {
    console.error("Error writing settings store:", error);
  }
}

export async function GET(req: NextRequest) {
  try {
    const userId = req.headers.get("Authorization")?.replace("Bearer ", "");

    if (!userId) {
      return NextResponse.json(
        { error: "未授权访问" },
        { status: 401 }
      );
    }

    const store = readStore();
    const userSettings = store[userId] || {
      language: "zh-CN",
      theme: "light",
      notifications: {
        email: true,
        browser: true,
        marketing: false,
      },
      displayDensity: "comfortable",
    };

    return NextResponse.json({
      success: true,
      data: userSettings,
    });
  } catch (error) {
    console.error("Get user settings error:", error);
    return NextResponse.json(
      { error: "获取用户设置失败" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const userId = req.headers.get("Authorization")?.replace("Bearer ", "");

    if (!userId) {
      return NextResponse.json(
        { error: "未授权访问" },
        { status: 401 }
      );
    }

    const body = await req.json();

    const store = readStore();
    store[userId] = body;
    writeStore(store);

    return NextResponse.json({
      success: true,
      data: body,
    });
  } catch (error) {
    console.warn("Update user settings error:", error);
    return NextResponse.json(
      { error: "更新用户设置失败" },
      { status: 500 }
    );
  }
}
