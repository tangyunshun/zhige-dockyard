import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { validateUser } from "@/lib/auth";

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
    const auth = await validateUser(req.headers.get("Authorization"), req);
    if (!auth.valid || !auth.user) {
      return NextResponse.json(
        { error: "未授权访问" },
        { status: 401 }
      );
    }
    const userId = auth.user.id;

    const DEFAULT_SETTINGS = {
      language: "zh-CN",
      theme: "light",
      displayDensity: "comfortable",
      enableAnimations: true,
      // 默认工作空间与中枢偏好
      defaultWorkspaceId: "auto", // auto | workspaceId
      workspaceView: "grid", // grid | list
      sidebarDefaultExpanded: true,
      componentSort: "popularity", // popularity | updatedAt | name
      // 代码与开发偏好
      codeTheme: "dark", // dark | light
      codeFontSize: "13px", // 12px | 13px | 14px
      tabSize: 2, // 2 | 4
      showLineNumbers: true,
      // 日期时间与数据导出偏好
      dateFormat: "YYYY-MM-DD", // YYYY-MM-DD | YYYY/MM/DD | YYYY年MM月DD日
      timeFormat: "24h", // 24h | 12h
      exportFormat: "xlsx", // xlsx | json
      // 声音与交互
      soundEffects: true,
      // 隐私安全
      stealthMode: false,
      requireDeleteConfirm: true,
    };

    const store = readStore();
    const userSettings = {
      ...DEFAULT_SETTINGS,
      ...(store[userId] || {}),
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
    const auth = await validateUser(req.headers.get("Authorization"), req);
    if (!auth.valid || !auth.user) {
      return NextResponse.json(
        { error: "未授权访问" },
        { status: 401 }
      );
    }
    const userId = auth.user.id;

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
