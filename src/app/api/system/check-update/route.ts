import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import packageJson from "../../../../../package.json";

export const dynamic = "force-dynamic";

const RELEASE_NOTES_KEY = "SYSTEM_RELEASE_NOTES_V1";
const UPDATE_SETTINGS_KEY = "SYSTEM_UPDATE_SETTINGS_V1";
const BASE_SYSTEM_VERSION = `v${packageJson.version || "1.0.0"}`;

interface ReleaseNote {
  id: string;
  version: string;
  title: string;
  type: "FEATURE" | "OPTIMIZE" | "BUGFIX" | "SECURITY";
  publishDate: string;
  isPublished: boolean;
  author: string;
  items: string[];
}

/**
 * 语义化版本号对比
 * 返回 1 表示 v1 > v2，-1 表示 v1 < v2，0 表示相等
 */
function compareVersions(v1: string, v2: string): number {
  const clean1 = (v1 || "").replace(/^[vV]/, "").split("-")[0];
  const clean2 = (v2 || "").replace(/^[vV]/, "").split("-")[0];
  const p1 = clean1.split(".").map((n) => parseInt(n, 10) || 0);
  const p2 = clean2.split(".").map((n) => parseInt(n, 10) || 0);
  const maxLen = Math.max(p1.length, p2.length);

  for (let i = 0; i < maxLen; i++) {
    const num1 = p1[i] || 0;
    const num2 = p2[i] || 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
}

/**
 * 真实的系统检查更新 API
 * 1. 真实从数据库和系统工程配置读取版本
 * 2. 真实进行 SemVer 版本比对，判断是否有新版本待升级
 * 3. 真实检测服务与数据库联通延迟，杜绝任何硬编码模拟
 */
export async function GET(request: NextRequest) {
  try {
    // 1. 获取当前系统运行基准版本
    const versionRow = await prisma.systemconfig.findUnique({
      where: { key: "system_version" },
    });
    const currentVersion = versionRow?.value || BASE_SYSTEM_VERSION;

    // 2. 获取更新设置（发布通道与公告标题等）
    const settingsRow = await prisma.systemconfig.findUnique({
      where: { key: UPDATE_SETTINGS_KEY },
    });
    let releaseChannel = "STABLE";
    let notifyModalEnabled = true;
    let popupTitle = "知阁·舟坊新版本发布公告";
    if (settingsRow && settingsRow.value) {
      try {
        const parsed = JSON.parse(settingsRow.value);
        if (parsed.releaseChannel) releaseChannel = parsed.releaseChannel;
        if (parsed.popupTitle) popupTitle = parsed.popupTitle;
        if (typeof parsed.notifyModalEnabled === "boolean") notifyModalEnabled = parsed.notifyModalEnabled;
      } catch {}
    }

    // 3. 读取数据库中已发布的正式发版公告列表
    const releasesRow = await prisma.systemconfig.findUnique({
      where: { key: RELEASE_NOTES_KEY },
    });
    let publishedReleases: ReleaseNote[] = [];
    if (releasesRow && releasesRow.value) {
      try {
        const parsed = JSON.parse(releasesRow.value);
        if (Array.isArray(parsed)) {
          publishedReleases = parsed.filter((r: ReleaseNote) => r.isPublished);
          // 按版本由高到低排序
          publishedReleases.sort((a, b) => compareVersions(b.version, a.version));
        }
      } catch {}
    }

    const topRelease = publishedReleases.length > 0 ? publishedReleases[0] : null;

    // 4. 真实语义化版本对比
    let hasUpdate = false;
    let latestVersion = currentVersion;

    if (topRelease) {
      const cmp = compareVersions(topRelease.version, currentVersion);
      if (cmp > 0) {
        hasUpdate = true;
        latestVersion = topRelease.version;
      }
    }

    // 5. 真实探测服务健康与数据库往返延迟
    let serviceStatus: "HEALTHY" | "DEGRADED" = "HEALTHY";
    let latencyMs = 0;
    try {
      const startTime = performance.now();
      await prisma.$queryRaw`SELECT 1`;
      latencyMs = Math.round(performance.now() - startTime);
    } catch {
      serviceStatus = "DEGRADED";
    }

    const now = new Date();
    const checkedAt = now.toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    return NextResponse.json({
      success: true,
      hasUpdate,
      currentVersion,
      latestVersion,
      releaseChannel,
      popupTitle,
      notifyModalEnabled,
      checkedAt,
      serviceLatencyMs: latencyMs,
      serviceStatus,
      latestRelease: hasUpdate ? topRelease : null,
    });
  } catch (error: any) {
    console.error("检查更新服务异常:", error);
    return NextResponse.json(
      {
        success: false,
        error: "系统版本检测服务响应异常，请稍后重试",
        details: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}
