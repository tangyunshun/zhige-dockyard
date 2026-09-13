import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminRole, validateUser } from "@/lib/auth";
import { setMaintenanceMode, isMaintenanceMode, getMaintenanceMessage } from "@/lib/maintenance";

/**
 * 系统维护模式API（PRD G-02：持久化到 DB，重启后仍生效）
 */

// 真实系统工程基准版本（来自项目 package.json）
import packageJson from "../../../../../package.json";
const BASE_SYSTEM_VERSION = `v${packageJson.version || "1.0.0"}`;

// 系统发版更新日志字典键名
const RELEASE_NOTES_KEY = "SYSTEM_RELEASE_NOTES_V1";
// 系统计划维护任务字典键名
const MAINTENANCE_SCHEDULES_KEY = "SYSTEM_MAINTENANCE_SCHEDULES_V1";
// 系统发版与更新设置配置键名
const UPDATE_SETTINGS_KEY = "SYSTEM_UPDATE_SETTINGS_V1";

export interface SystemUpdateSettings {
  autoCheckUpdate: boolean;
  notifyModalEnabled: boolean;
  forceUpdate: boolean;
  minSupportedVersion: string;
  releaseChannel: "STABLE" | "BETA";
  customDownloadUrl: string;
  popupTitle: string;
}

const DEFAULT_UPDATE_SETTINGS: SystemUpdateSettings = {
  autoCheckUpdate: true,
  notifyModalEnabled: true,
  forceUpdate: false,
  minSupportedVersion: "v1.0.0",
  releaseChannel: "STABLE",
  customDownloadUrl: "",
  popupTitle: "知阁·舟坊新版本发布公告",
};

async function getUpdateSettingsFromDB(): Promise<SystemUpdateSettings> {
  try {
    const row = await prisma.systemconfig.findUnique({ where: { key: UPDATE_SETTINGS_KEY } });
    if (row && row.value) {
      const parsed = JSON.parse(row.value);
      return { ...DEFAULT_UPDATE_SETTINGS, ...parsed };
    }
  } catch (err) {
    console.error("读取更新设置失败:", err);
  }
  return DEFAULT_UPDATE_SETTINGS;
}

// 识别并清洗旧代码中误写入 DB 的捏造假数据标识
const FAKE_RELEASE_IDS = new Set(["rel-20260908-01", "rel-20260825-01", "rel-20260810-01"]);
const FAKE_SCHEDULE_IDS = new Set(["maint-20260920-01", "maint-20260905-01"]);

async function getReleasesFromDB() {
  try {
    const row = await prisma.systemconfig.findUnique({ where: { key: RELEASE_NOTES_KEY } });
    if (row && row.value) {
      const parsed = JSON.parse(row.value);
      if (Array.isArray(parsed)) {
        // 清洗存量捏造假数据，只保留真实录入记录
        const cleaned = parsed.filter((r: any) => !FAKE_RELEASE_IDS.has(r.id));
        if (cleaned.length !== parsed.length) {
          await prisma.systemconfig.update({
            where: { key: RELEASE_NOTES_KEY },
            data: { value: JSON.stringify(cleaned) },
          });
        }
        return cleaned;
      }
    }
    return [];
  } catch (err) {
    console.error("读取发版记录失败:", err);
    return [];
  }
}

async function getSchedulesFromDB() {
  try {
    const row = await prisma.systemconfig.findUnique({ where: { key: MAINTENANCE_SCHEDULES_KEY } });
    if (row && row.value) {
      const parsed = JSON.parse(row.value);
      if (Array.isArray(parsed)) {
        // 清洗存量捏造假数据，只保留真实录入任务
        const cleaned = parsed.filter((s: any) => !FAKE_SCHEDULE_IDS.has(s.id));
        if (cleaned.length !== parsed.length) {
          await prisma.systemconfig.update({
            where: { key: MAINTENANCE_SCHEDULES_KEY },
            data: { value: JSON.stringify(cleaned) },
          });
        }
        return cleaned;
      }
    }
    return [];
  } catch (err) {
    console.error("读取维护计划失败:", err);
    return [];
  }
}

/**
 * 获取系统维护状态、维护计划与发版公告（100% 真实数据库持久化数据）
 */
export async function GET(request: NextRequest) {
  try {
    if (request.nextUrl.searchParams.get("action") === "emergency_disable") {
      await setMaintenanceMode(false);
    }
    const inMaintenance = await isMaintenanceMode();
    const message = await getMaintenanceMessage();
    
    // 从数据库读取预计维护耗时
    const estRow = await prisma.systemconfig.findUnique({ where: { key: "maintenance_estimated" } });
    const estimatedMinutes = estRow?.value || "30";

    const [releases, schedules, updateSettings] = await Promise.all([
      getReleasesFromDB(),
      getSchedulesFromDB(),
      getUpdateSettingsFromDB(),
    ]);

    // 生产当前版本真实计算逻辑：
    // 1. 优先取数据库最新生效并公示的发布版本；
    // 2. 其次取数据库系统配置中的版本指定值；
    // 3. 最终以项目工程真实版本（package.json v1.0.0）为准，严禁捏造假版本。
    const publishedReleases = releases.filter((r: any) => r.isPublished);
    const latestRelease = publishedReleases.length > 0 ? publishedReleases[0].version : null;
    const versionConfigRow = await prisma.systemconfig.findUnique({ where: { key: "system_version" } });
    const currentVersion = latestRelease || versionConfigRow?.value || BASE_SYSTEM_VERSION;

    return NextResponse.json({
      success: true,
      maintenanceMode: inMaintenance,
      maintenanceMessage: message,
      estimatedMinutes,
      currentVersion,
      updateSettings,
      releases,
      schedules,
      currentTime: new Date().toISOString(),
    });
  } catch (err) {
    console.error("获取系统维护及发版信息失败:", err);
    return NextResponse.json({ error: "获取维护信息失败" }, { status: 500 });
  }
}

/**
 * 设置系统维护状态、维护计划与发版公告（仅管理员）
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "未授权，请先登录" }, { status: 401 });
    }
    const adminId = auth.user.id;
    const admin = await prisma.user.findUnique({
      where: { id: adminId },
    });

    if (!admin || !isAdminRole(admin.role)) {
      return NextResponse.json({ error: "权限不足，需要管理员权限" }, { status: 403 });
    }

    const body = await request.json();
    const { action } = body;

    // 业务闭环 1：维护计划的增删改
    if (action === "create_schedule" || action === "update_schedule") {
      const scheduleData = body.schedule;
      if (!scheduleData || !scheduleData.title || !scheduleData.startTime) {
        return NextResponse.json({ error: "缺少维护任务标题或开始时间" }, { status: 400 });
      }

      const schedules = await getSchedulesFromDB();
      let updatedSchedules: any[];

      if (action === "create_schedule") {
        const isDowntime =
          scheduleData.isDowntime !== undefined
            ? Boolean(scheduleData.isDowntime)
            : scheduleData.type === "UPGRADE" || scheduleData.type === "DATABASE";

        const newSchedule = {
          id: `maint-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          title: scheduleData.title.trim(),
          type: scheduleData.type || "UPGRADE",
          status: scheduleData.status || "SCHEDULED",
          isDowntime,
          startTime: scheduleData.startTime,
          endTime: scheduleData.endTime || "待定",
          manager: scheduleData.manager || admin.name || "平台运维组",
          scope: scheduleData.scope || "全站系统服务",
          description: scheduleData.description || "",
          actualResult: "",
        };
        updatedSchedules = [newSchedule, ...schedules];
      } else {
        updatedSchedules = schedules.map((s: any) =>
          s.id === scheduleData.id
            ? {
                ...s,
                ...scheduleData,
                isDowntime:
                  scheduleData.isDowntime !== undefined
                    ? Boolean(scheduleData.isDowntime)
                    : s.isDowntime !== undefined
                    ? s.isDowntime
                    : s.type === "UPGRADE" || s.type === "DATABASE",
              }
            : s
        );
      }

      await prisma.systemconfig.upsert({
        where: { key: MAINTENANCE_SCHEDULES_KEY },
        create: { key: MAINTENANCE_SCHEDULES_KEY, value: JSON.stringify(updatedSchedules) },
        update: { value: JSON.stringify(updatedSchedules) },
      });

      // 智能双向联动：若请求声明了同步维护模式电闸（syncMaintenanceMode）
      if (body.syncMaintenanceMode) {
        if (scheduleData.status === "IN_PROGRESS") {
          await setMaintenanceMode(true);
          const maintMsg = `系统正在进行【${scheduleData.title}】\n影响范围：${scheduleData.scope || "全站系统服务"}\n${scheduleData.description ? `详细说明：${scheduleData.description}` : ""}`;
          await prisma.systemconfig.upsert({
            where: { key: "maintenance_message" },
            create: { key: "maintenance_message", value: maintMsg },
            update: { value: maintMsg },
          });
        } else if (scheduleData.status === "COMPLETED" || scheduleData.status === "CANCELLED") {
          await setMaintenanceMode(false);
        }
      }

      return NextResponse.json({
        success: true,
        message: action === "create_schedule" ? "维护计划已成功登记落库！" : "维护计划已更新！",
        schedules: updatedSchedules,
        maintenanceMode: await isMaintenanceMode(),
      });
    }

    if (action === "delete_schedule") {
      const { scheduleId } = body;
      if (!scheduleId) {
        return NextResponse.json({ error: "缺少维护计划 ID" }, { status: 400 });
      }
      const schedules = await getSchedulesFromDB();
      const updatedSchedules = schedules.filter((s: any) => s.id !== scheduleId);
      await prisma.systemconfig.upsert({
        where: { key: MAINTENANCE_SCHEDULES_KEY },
        create: { key: MAINTENANCE_SCHEDULES_KEY, value: JSON.stringify(updatedSchedules) },
        update: { value: JSON.stringify(updatedSchedules) },
      });
      return NextResponse.json({
        success: true,
        message: "已成功从数据库删除该维护计划记录",
        schedules: updatedSchedules,
      });
    }

    // 业务闭环 2：发版更新日志的增删改与公示控制
    if (action === "create_release" || action === "update_release") {
      const releaseData = body.release;
      if (!releaseData || !releaseData.version || !releaseData.title) {
        return NextResponse.json({ error: "缺少版本号或版本说明标题" }, { status: 400 });
      }

      const releases = await getReleasesFromDB();
      let updatedReleases: any[];

      if (action === "create_release") {
        const newRelease = {
          id: `rel-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          version: releaseData.version.trim(),
          title: releaseData.title.trim(),
          type: releaseData.type || "FEATURE",
          publishDate: releaseData.publishDate || new Date().toISOString().split("T")[0],
          isPublished: releaseData.isPublished ?? true,
          author: releaseData.author || admin.name || "平台研发组",
          items: Array.isArray(releaseData.items)
            ? releaseData.items.filter((it: string) => it.trim().length > 0)
            : [releaseData.title.trim()],
        };
        updatedReleases = [newRelease, ...releases];
      } else {
        updatedReleases = releases.map((r: any) =>
          r.id === releaseData.id ? { ...r, ...releaseData } : r
        );
      }

      await prisma.systemconfig.upsert({
        where: { key: RELEASE_NOTES_KEY },
        create: { key: RELEASE_NOTES_KEY, value: JSON.stringify(updatedReleases) },
        update: { value: JSON.stringify(updatedReleases) },
      });

      return NextResponse.json({
        success: true,
        message: action === "create_release" ? "新版本发版记录已成功录入数据库！" : "发版记录已更新！",
        releases: updatedReleases,
      });
    }

    if (action === "delete_release") {
      const { releaseId } = body;
      if (!releaseId) {
        return NextResponse.json({ error: "缺少发版记录 ID" }, { status: 400 });
      }
      const releases = await getReleasesFromDB();
      const updatedReleases = releases.filter((r: any) => r.id !== releaseId);
      await prisma.systemconfig.upsert({
        where: { key: RELEASE_NOTES_KEY },
        create: { key: RELEASE_NOTES_KEY, value: JSON.stringify(updatedReleases) },
        update: { value: JSON.stringify(updatedReleases) },
      });
      return NextResponse.json({
        success: true,
        message: "已成功删除该发版记录",
        releases: updatedReleases,
      });
    }

    if (action === "toggle_release_publish") {
      const { releaseId, isPublished } = body;
      const releases = await getReleasesFromDB();
      const updatedReleases = releases.map((r: any) =>
        r.id === releaseId ? { ...r, isPublished: Boolean(isPublished) } : r
      );
      await prisma.systemconfig.upsert({
        where: { key: RELEASE_NOTES_KEY },
        create: { key: RELEASE_NOTES_KEY, value: JSON.stringify(updatedReleases) },
        update: { value: JSON.stringify(updatedReleases) },
      });
      return NextResponse.json({
        success: true,
        message: isPublished ? "该版本更新已设为全网公示" : "已隐藏该版本的前台公示",
        releases: updatedReleases,
      });
    }

    if (action === "save_update_settings") {
      const { settings } = body;
      if (!settings) {
        return NextResponse.json({ error: "缺少更新设置参数" }, { status: 400 });
      }
      const current = await getUpdateSettingsFromDB();
      const updated: SystemUpdateSettings = {
        ...current,
        ...(settings.autoCheckUpdate !== undefined ? { autoCheckUpdate: Boolean(settings.autoCheckUpdate) } : {}),
        ...(settings.notifyModalEnabled !== undefined ? { notifyModalEnabled: Boolean(settings.notifyModalEnabled) } : {}),
        ...(settings.forceUpdate !== undefined ? { forceUpdate: Boolean(settings.forceUpdate) } : {}),
        ...(settings.minSupportedVersion ? { minSupportedVersion: String(settings.minSupportedVersion).trim() } : {}),
        ...(settings.releaseChannel ? { releaseChannel: settings.releaseChannel } : {}),
        ...(settings.customDownloadUrl !== undefined ? { customDownloadUrl: String(settings.customDownloadUrl).trim() } : {}),
        ...(settings.popupTitle ? { popupTitle: String(settings.popupTitle).trim() } : {}),
      };

      await prisma.systemconfig.upsert({
        where: { key: UPDATE_SETTINGS_KEY },
        create: { key: UPDATE_SETTINGS_KEY, value: JSON.stringify(updated) },
        update: { value: JSON.stringify(updated) },
      });

      if (settings.systemVersion) {
        await prisma.systemconfig.upsert({
          where: { key: "system_version" },
          create: { key: "system_version", value: String(settings.systemVersion).trim() },
          update: { value: String(settings.systemVersion).trim() },
        });
      }

      return NextResponse.json({
        success: true,
        message: "系统发版与更新设置已成功保存到数据库！",
        updateSettings: updated,
      });
    }

    // 业务闭环 3：系统维护模式开关与维护说明修改（持久化到 DB）
    const { enabled, message, estimatedMinutes } = body;
    const target = enabled !== undefined ? Boolean(enabled) : await isMaintenanceMode();

    await setMaintenanceMode(target);
    if (message !== undefined) {
      await prisma.systemconfig.upsert({
        where: { key: "maintenance_message" },
        create: { key: "maintenance_message", value: message.trim() },
        update: { value: message.trim() },
      });
    }
    if (estimatedMinutes !== undefined) {
      await prisma.systemconfig.upsert({
        where: { key: "maintenance_estimated" },
        create: { key: "maintenance_estimated", value: String(estimatedMinutes) },
        update: { value: String(estimatedMinutes) },
      });
    }

    console.log(`[系统维护] 管理员 ${adminId} 设置维护模式: ${target}`);

    // 开启维护时，清除普通用户的登录会话（强制退出）
    if (target) {
      const result = await prisma.user.updateMany({
        where: {
          role: {
            notIn: ["ADMIN", "SUPERADMIN", "SUPER_ADMIN", "admin", "superadmin", "super_admin"],
          },
          sessionToken: { not: null },
        },
        data: {
          sessionToken: null,
          sessionExpiresAt: null,
          refreshToken: null,
          refreshTokenExpiresAt: null,
          lastForcedLogoutAt: new Date(),
        },
      });
      console.log(`[系统维护] 维护已开启，已清除 ${result.count} 个在线普通用户的登录会话`);
    }

    return NextResponse.json({
      success: true,
      maintenanceMode: target,
      maintenanceMessage: message || (await getMaintenanceMessage()),
      estimatedMinutes: estimatedMinutes || "30",
      message: target ? "系统维护模式已开启，普通用户访问已被拦截" : "系统维护已结束，全平台已恢复正常对外服务",
    });
  } catch (error) {
    console.error("处理维护管理操作失败:", error);
    return NextResponse.json({ error: "操作处理失败，请稍后重试" }, { status: 500 });
  }
}

/**
 * 关闭维护模式（仅管理员）
 */
export async function DELETE(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    const adminId = auth.user.id;
    const admin = await prisma.user.findUnique({
      where: { id: adminId },
    });

    if (!admin || !isAdminRole(admin.role)) {
      return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });
    }

    await setMaintenanceMode(false);
    console.log(`[系统维护] 管理员 ${adminId} 关闭维护模式`);

    return NextResponse.json({ success: true, message: "系统维护模式已关闭，已恢复正常运行" });
  } catch (error) {
    console.error("关闭维护模式失败:", error);
    return NextResponse.json({ error: "操作失败" }, { status: 500 });
  }
}

/**
 * 供 check-maintenance 路由使用的同步检查
 */
export async function isInMaintenance(): Promise<{ inMaintenance: boolean; message?: string }> {
  const inMaintenance = await isMaintenanceMode();
  if (!inMaintenance) return { inMaintenance: false };
  return { inMaintenance: true, message: await getMaintenanceMessage() };
}
