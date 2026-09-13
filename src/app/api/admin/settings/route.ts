import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSystemSettingsAdmin } from "@/lib/security";
import {
  getNavPresets,
  getOAuthProviderCatalog,
  getOfficialNavTemplate,
  getOfficialOAuthTemplate,
  getSmsProviders,
  saveSmsProviders,
  type SmsProviderItem,
} from "@/lib/setting-catalogs";

/**
 * 系统全局配置与状态 API
 * 读写 systemconfig 表（站点基础信息、SMTP邮件服务、短信网关、安全防御、OAuth配置）
 * 以及实时检测数据库运行健康度、表记录统计与备份归档状态
 */

const CONFIG_KEYS = [
  // 基础设置
  "siteName",
  "siteUrl",
  "description",
  "logo",
  "copyright",
  "icpNumber",
  // 邮件设置
  "smtpHost",
  "smtpPort",
  "smtpUser",
  "smtpPass",
  "senderEmail",
  "senderName",
  // 短信设置
  "smsProvider",
  "smsAccessKeyId",
  "smsAccessKeySecret",
  "smsSignName",
  "smsTemplateCode",
  "smsCustomApiUrl",
  // 第三方OAuth设置
  "oauthGithubEnabled",
  "oauthGithubClientId",
  "oauthGithubClientSecret",
  "oauthWechatEnabled",
  "oauthWechatAppId",
  "oauthWechatAppSecret",
  "oauthChannels",
  // 安全与风控
  "loginMaxFailures",
  "ipRateLimitMinute",
  "passwordExpireDays",
  "sessionTimeoutHours",
  // 前台页脚 Footer 与导航设置
  "footerSlogan",
  "footerSubTitle",
  "footerWechatQr",
  "footerQqQr",
  "footerWeiboQr",
  "footerPoliceIcp",
  "footerNavColumns",
  // 灾备与快照归档
  "last_db_backup_time",
  "last_db_backup_info",
];

const DEFAULT_CONFIGS: Record<string, string> = {
  siteName: "知阁·舟坊",
  siteUrl: "https://dockyard.zhige.com",
  description: "企业级全生命周期软件组件工程与效能中枢平台",
  logo: "/logo.png",
  copyright: "© 2026 ZhiGe OS · 知阁·舟坊 · 京ICP备 2026000000 号-1",
  icpNumber: "京ICP备 2026000000 号-1",
  smtpHost: "smtp.zhige.com",
  smtpPort: "587",
  smtpUser: "service@zhige.com",
  smtpPass: "",
  senderEmail: "noreply@zhige.com",
  senderName: "知阁舟坊运维中枢",
  smsProvider: "aliyun",
  smsAccessKeyId: "LTAI5t****",
  smsAccessKeySecret: "9Xz8****",
  smsSignName: "知阁科技",
  smsTemplateCode: "SMS_20260904",
  oauthGithubEnabled: "false",
  oauthGithubClientId: "",
  oauthGithubClientSecret: "",
  oauthWechatEnabled: "false",
  oauthWechatAppId: "",
  oauthWechatAppSecret: "",
  loginMaxFailures: "5",
  ipRateLimitMinute: "120",
  passwordExpireDays: "90",
  sessionTimeoutHours: "24",
  footerSlogan: "全球领先的软件工程效能操作系统，致力于消除研发链路中的低效瓶颈，释放创造力。",
  footerSubTitle: "ZhiGe Dockyard",
  footerWechatQr: "https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=https://zhige-dockyard.com/wechat",
  footerQqQr: "https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=https://zhige-dockyard.com/qq",
  footerWeiboQr: "https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=https://zhige-dockyard.com/weibo",
  footerPoliceIcp: "京公网安备 31000000000000 号",
  footerNavColumns: JSON.stringify([
    {
      title: "产品",
      links: [
        { label: "核心模块", url: "/capabilities" },
        { label: "组件大全", url: "/market" },
        { label: "更新日志", url: "/docs" },
        { label: "组件广场", url: "/market" },
      ],
    },
    {
      title: "资源",
      links: [
        { label: "帮助中心", url: "/help" },
        { label: "API 文档", url: "/docs" },
        { label: "最佳实践", url: "/knowledge" },
        { label: "开发者社区", url: "/developers" },
      ],
    },
    {
      title: "解决方案",
      links: [
        { label: "政务云", url: "/solutions" },
        { label: "军工科研", url: "/solutions" },
        { label: "金融信创", url: "/solutions" },
        { label: "智慧城市", url: "/solutions" },
      ],
    },
    {
      title: "公司",
      links: [
        { label: "关于我们", url: "/developers" },
        { label: "联系商务", url: "/help" },
        { label: "隐私条款", url: "/privacy-policy" },
        { label: "加入我们", url: "/developers" },
      ],
    },
  ]),
};

/**
 * 系统设置域统一鉴权：与后台前端 superAdminOnly 守卫对齐，
 * 必须是平台超级管理员且具备 system:settings 权限点。
 */
async function assertAdmin(request: NextRequest): Promise<{ ok: true; adminId: string; adminName: string } | { ok: false; status: number; message: string }> {
  const result = await requireSystemSettingsAdmin(request);
  if (!result.authorized || !result.user) {
    // 区分 401 / 403，便于前端给出准确提示
    const status = result.errorResponse?.status === 401 ? 401 : 403;
    return {
      ok: false,
      status,
      message:
        status === 401
          ? "未授权，请重新登录"
          : "越权警告：系统全局设置仅允许平台超级管理员操作",
    };
  }
  return { ok: true, adminId: result.user.id, adminName: result.user.name };
}

/** value 列扩容是否已在本进程内执行过（避免每次保存都触发表结构变更 DDL） */
let valueColumnExpanded = false;

/** 惰性扩容 system_config.value，突破 varchar(191) 限制，仅在写入报「过长」时触发一次 */
async function expandValueColumn(): Promise<void> {
  if (valueColumnExpanded) return;
  try {
    await prisma.$executeRawUnsafe(
      "ALTER TABLE `system_config` MODIFY COLUMN `value` MEDIUMTEXT NULL"
    );
    valueColumnExpanded = true;
  } catch (alterErr) {
    console.warn("system_config.value 字段扩容失败（非致命）:", alterErr);
  }
}

/** 数值型安全策略配置的合法区间（防止负数 / 0 / 超大值写入导致策略失效） */
const NUMERIC_RULES: Record<string, { min: number; max: number; label: string }> = {
  loginMaxFailures: { min: 3, max: 20, label: "登录密码连续试错上限" },
  ipRateLimitMinute: { min: 10, max: 100000, label: "IP 每分钟请求速率阈值" },
  passwordExpireDays: { min: 30, max: 720, label: "管理员强口令轮换周期" },
  sessionTimeoutHours: { min: 1, max: 720, label: "登录态会话免活有效期" },
  smtpPort: { min: 1, max: 65535, label: "SMTP 端口" },
};

/** 值域校验：返回错误信息，合法时返回 null */
function validateSettingValue(key: string, value: string): string | null {
  if (key === "siteUrl" && value.trim()) {
    const v = value.trim();
    const ok = /^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(v);
    if (!ok) return "平台主域名 URL 格式不合法，需以 http:// 或 https:// 开头";
  }
  if (key === "smtpPort" && value.trim()) {
    // 端口单独走整数强校验
  }
  const rule = NUMERIC_RULES[key];
  if (rule && value !== "" && value !== null && value !== undefined) {
    const n = Number(value);
    if (!Number.isFinite(n) || !Number.isInteger(n)) {
      return `${rule.label}必须为整数`;
    }
    if (n < rule.min || n > rule.max) {
      return `${rule.label}需在 ${rule.min} ~ ${rule.max} 之间`;
    }
  }
  return null;
}

/**
 * GET 获取系统设置及数据库统计
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await assertAdmin(request);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.message }, { status: auth.status });
    }

    // 1. 读取数据库中的系统配置记录
    const rows = await prisma.systemconfig.findMany({
      where: { key: { in: CONFIG_KEYS } },
    });

    const configMap: Record<string, string> = { ...DEFAULT_CONFIGS };
    rows.forEach((r) => {
      if (r.value !== null && r.value !== undefined) {
        configMap[r.key] = r.value;
      }
    });

    // 2. 真实获取数据库状态与各核心表统计
    const dbStartTime = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const dbPingLatency = Date.now() - dbStartTime;

    const [
      userCount,
      workspaceCount,
      componentCount,
      orderCount,
      logCount,
      appealCount,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.workspace.count(),
      prisma.componentcatalog.count(),
      prisma.billingrecord.count(),
      prisma.operationlog.count(),
      prisma.accountappeal.count(),
    ]);

    // 3. 真实数据库引擎版本（MySQL：SELECT VERSION()），失败时降级为 Prisma 标识
    let dbEngine = "Prisma ORM";
    try {
      const versionRows = await prisma.$queryRaw<{ version: string }[]>`SELECT VERSION() AS version`;
      const version = versionRows?.[0]?.version;
      if (version) dbEngine = `${version} / Prisma ORM`;
    } catch (engineErr) {
      console.warn("读取数据库引擎版本失败（非致命）:", engineErr);
    }

    // 4. 可维护目录型数据（平台目录 / 路由推荐 / 官方模板），全部取自数据库
    const [
      oauthProviderCatalog,
      navPresets,
      officialNavTemplate,
      officialOauthTemplate,
      smsProviders,
    ] = await Promise.all([
      getOAuthProviderCatalog(),
      getNavPresets(),
      getOfficialNavTemplate(),
      getOfficialOAuthTemplate(),
      getSmsProviders(),
    ]);

    const lastBackupTime = configMap.last_db_backup_time || null;

    const databaseStats = {
      // 状态由真实探针延迟推导，不再恒为 HEALTHY
      status: dbPingLatency > 500 ? "DEGRADED" : "HEALTHY",
      latencyMs: dbPingLatency,
      tableCounts: {
        users: userCount,
        workspaces: workspaceCount,
        components: componentCount,
        billingRecords: orderCount,
        operationLogs: logCount,
        accountAppeals: appealCount,
      },
      lastBackupTime,
      lastBackupInfo: configMap.last_db_backup_info || null,
      dbEngine,
    };

    return NextResponse.json({
      success: true,
      configs: configMap,
      databaseStats,
      // 目录型数据：前端零硬编码，一律以数据库为准
      oauthProviderCatalog,
      navPresets,
      officialNavTemplate,
      officialOauthTemplate,
      smsProviders,
    });
  } catch (error) {
    console.error("获取系统配置失败:", error);
    return NextResponse.json({ error: "获取配置失败，数据库或服务异常" }, { status: 500 });
  }
}

/**
 * POST 处理系统配置保存、Ping测速与快照备份
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await assertAdmin(request);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.message }, { status: auth.status });
    }

    const body = await request.json().catch(() => ({}));

    // 0. 独立 Action: 添加新的短信服务商（持久化保存至数据库）
    if (body.action === "add_sms_provider") {
      const { provider } = body;
      if (!provider || !provider.value || !provider.label) {
        return NextResponse.json({ error: "缺少短信服务商标识或显示名称" }, { status: 400 });
      }
      const cleanVal = String(provider.value).trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
      const cleanLabel = String(provider.label).trim();
      if (!cleanVal || !cleanLabel) {
        return NextResponse.json({ error: "服务商标识与名称不能为空" }, { status: 400 });
      }

      const currentList = await getSmsProviders();
      if (currentList.some((p) => p.value === cleanVal)) {
        return NextResponse.json({ error: `短信服务商标识【${cleanVal}】已存在，请勿重复添加` }, { status: 400 });
      }

      const updated = [...currentList, { value: cleanVal, label: cleanLabel }];
      await saveSmsProviders(updated);
      return NextResponse.json({
        success: true,
        message: `短信服务商【${cleanLabel}】已成功添加至系统字典！`,
        smsProviders: updated,
      });
    }

    // 0.1 独立 Action: 移除指定的短信服务商
    if (body.action === "delete_sms_provider") {
      const { value } = body;
      if (!value) {
        return NextResponse.json({ error: "缺少待删除的服务商标识" }, { status: 400 });
      }
      const currentList = await getSmsProviders();
      const target = currentList.find((p) => p.value === value);
      if (!target) {
        return NextResponse.json({ error: "目标短信服务商不存在" }, { status: 404 });
      }
      const updated = currentList.filter((p) => p.value !== value);
      await saveSmsProviders(updated);
      return NextResponse.json({
        success: true,
        message: `短信服务商【${target.label}】已成功移除！`,
        smsProviders: updated,
      });
    }

    // 1. 独立 Action: 即时测定数据库延迟 (Ping)
    if (body.action === "ping_db") {
      const pingStart = Date.now();
      await prisma.$queryRaw`SELECT 1`;
      const latencyMs = Date.now() - pingStart;
      return NextResponse.json({
        success: true,
        latencyMs,
        status: latencyMs > 500 ? "DEGRADED" : "HEALTHY",
        pingTime: new Date().toISOString(),
      });
    }

    // 2. 独立 Action: 创建全量数据备份快照并导出元数据包
    if (body.action === "create_backup") {
      const backupTimeStr = new Date().toISOString();
      const [
        allConfigs,
        userCount,
        workspaceCount,
        componentCount,
        orderCount,
        logCount,
        appealCount,
      ] = await Promise.all([
        prisma.systemconfig.findMany(),
        prisma.user.count(),
        prisma.workspace.count(),
        prisma.componentcatalog.count(),
        prisma.billingrecord.count(),
        prisma.operationlog.count(),
        prisma.accountappeal.count(),
      ]);

      // 真实读取数据库引擎版本，避免快照元数据写死引擎型号
      let dbEngineLabel = "Prisma Client";
      try {
        const versionRows = await prisma.$queryRaw<{ version: string }[]>`SELECT VERSION() AS version`;
        if (versionRows?.[0]?.version) {
          dbEngineLabel = `${versionRows[0].version} / Prisma Client`;
        }
      } catch {}

      const backupData = {
        meta: {
          platform: "知阁·舟坊软件工程效能中枢",
          exportTime: backupTimeStr,
          engine: dbEngineLabel,
          operatorId: auth.adminId,
          operatorName: auth.adminName || "",
          scope: "system_config 全量配置 + 核心业务表记录统计（不含业务表明细数据）",
        },
        tableStatistics: {
          users: userCount,
          workspaces: workspaceCount,
          components: componentCount,
          billingRecords: orderCount,
          operationLogs: logCount,
          accountAppeals: appealCount,
        },
        systemConfigs: allConfigs.map((c) => ({ key: c.key, value: c.value })),
      };

      const totalRecords =
        userCount + workspaceCount + componentCount + orderCount + logCount + appealCount;
      const backupSummary = `配置快照 ${allConfigs.length} 项，业务表记录约 ${totalRecords} 条`;

      // 真实将最近归档时间持久化落库
      await prisma.systemconfig.upsert({
        where: { key: "last_db_backup_time" },
        create: { key: "last_db_backup_time", value: backupTimeStr },
        update: { value: backupTimeStr },
      });
      await prisma.systemconfig.upsert({
        where: { key: "last_db_backup_info" },
        create: { key: "last_db_backup_info", value: backupSummary },
        update: { value: backupSummary },
      });

      // 记录管理员审计日志
      try {
        await prisma.operationlog.create({
          data: {
            id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            userId: auth.adminId,
            action: "system:create_db_backup",
            resource: "database_snapshot",
            details: JSON.stringify({
              backupTime: backupTimeStr,
              summary: backupSummary,
            }),
          },
        });
      } catch {}

      return NextResponse.json({
        success: true,
        message: "数据备份快照创建成功，已同步更新归档记录！",
        backupTime: backupTimeStr,
        backupData,
      });
    }

    const settings = body.settings;
    if (!settings || typeof settings !== "object") {
      return NextResponse.json({ error: "参数格式错误" }, { status: 400 });
    }

    // 业务红线前置校验：登录页面排版最多支持开启 2 个第三方联合登录渠道
    let oauthAuditDetail: any = null;
    let isOauthUpdate = false;
    if (settings.oauthChannels) {
      isOauthUpdate = true;
      try {
        const channels = typeof settings.oauthChannels === "string"
          ? JSON.parse(settings.oauthChannels)
          : settings.oauthChannels;
        if (Array.isArray(channels)) {
          // 同一平台不允许重复登记，避免前台登录页出现两个相同入口
          const typeSeen = new Set<string>();
          let duplicated: any = null;
          for (const c of channels as any[]) {
            const t = String(c?.type || "").trim();
            if (!t) continue;
            if (typeSeen.has(t)) {
              duplicated = c;
              break;
            }
            typeSeen.add(t);
          }
          if (duplicated) {
            return NextResponse.json(
              {
                error: `第三方登录渠道【${duplicated.name || duplicated.type}】重复登记，同一平台仅允许添加一次`,
              },
              { status: 400 }
            );
          }

          const enabled = channels.filter((c: any) => c.enabled === true);
          if (enabled.length > 2) {
            return NextResponse.json(
              {
                error: `登录页面排版规范最多支持开启 2 个第三方登录渠道，当前提交了 ${enabled.length} 个开启渠道。请先禁用部分渠道后再保存！`,
              },
              { status: 400 }
            );
          }
          oauthAuditDetail = {
            actionName: "更新第三方联合登录渠道",
            totalCount: channels.length,
            enabledCount: enabled.length,
            enabledChannels: enabled.map((c: any) => c.name || c.type),
          };
        }
      } catch (e) {
        // json parse error
      }
    }

    // 1. 前台分类导航结构校验（防止空标题 / 空链接被写入后前台渲染异常）
    if (settings.footerNavColumns !== undefined) {
      try {
        const cols =
          typeof settings.footerNavColumns === "string"
            ? JSON.parse(settings.footerNavColumns)
            : settings.footerNavColumns;
        if (!Array.isArray(cols)) {
          return NextResponse.json(
            { error: "前台分类导航数据格式不合法，需为数组" },
            { status: 400 }
          );
        }
        for (const col of cols) {
          if (!col || typeof col.title !== "string" || !col.title.trim()) {
            return NextResponse.json(
              { error: "前台分类导航每个分类都必须填写标题" },
              { status: 400 }
            );
          }
          if (!Array.isArray(col.links)) {
            return NextResponse.json(
              { error: `分类【${col.title}】的链接列表格式不合法` },
              { status: 400 }
            );
          }
          for (const link of col.links) {
            if (
              !link ||
              !String(link.label || "").trim() ||
              !String(link.url || "").trim()
            ) {
              return NextResponse.json(
                { error: `分类【${col.title}】中存在名称或链接为空的导航项` },
                { status: 400 }
              );
            }
          }
        }
      } catch (e) {
        return NextResponse.json(
          { error: "前台分类导航数据解析失败，请检查 JSON 格式" },
          { status: 400 }
        );
      }
    }

    // 2. 写入前统一值域校验，非法配置直接拒绝落库
    const validationErrors: string[] = [];
    for (const [key, value] of Object.entries(settings)) {
      if (!CONFIG_KEYS.includes(key)) continue;
      const error = validateSettingValue(key, String(value ?? ""));
      if (error && !validationErrors.includes(error)) {
        validationErrors.push(error);
      }
    }
    if (validationErrors.length > 0) {
      return NextResponse.json({ error: validationErrors.join("；") }, { status: 400 });
    }

    // 3. 稳健顺序写入 systemconfig 表（遇到「值过长」时惰性扩容一次后重试，不再每次保存都执行 DDL）
    for (const [key, value] of Object.entries(settings)) {
      if (CONFIG_KEYS.includes(key)) {
        let valStr = String(value ?? "");
        // 若为复杂 JSON 配置，进行紧凑化去冗余空格换行处理
        if (key === "oauthChannels" || key === "footerNavColumns") {
          try {
            valStr = JSON.stringify(JSON.parse(valStr));
          } catch (e) {
            // 保留原字符串
          }
        }
        try {
          await prisma.systemconfig.upsert({
            where: { key },
            create: { key, value: valStr },
            update: { value: valStr },
          });
        } catch (writeErr: any) {
          const rawMsg = String(writeErr?.message || "");
          if (rawMsg.includes("too long") && !valueColumnExpanded) {
            await expandValueColumn();
            await prisma.systemconfig.upsert({
              where: { key },
              create: { key, value: valStr },
              update: { value: valStr },
            });
          } else {
            throw writeErr;
          }
        }
      }
    }

    // 3. 记录管理员审计日志与消息提醒闭环
    try {
      await prisma.operationlog.create({
        data: {
          id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          userId: auth.adminId,
          action: isOauthUpdate ? "system:update_oauth_channels" : "system:update_settings",
          resource: isOauthUpdate ? "oauth_channels" : "system_config",
          details: JSON.stringify(oauthAuditDetail || { updatedKeys: Object.keys(settings) }),
        },
      });

      // 若为第三方登录渠道策略更新，同时写入一条系统通知，形成消息提醒闭环
      if (isOauthUpdate && oauthAuditDetail) {
        await prisma.notification.create({
          data: {
            id: crypto.randomUUID(),
            userId: auth.adminId,
            title: "⚙️ 第三方联合登录渠道策略已更新",
            content: `管理员已更新联合登录配置，当前前台登录页已启用 ${oauthAuditDetail.enabledCount} 个渠道（${oauthAuditDetail.enabledChannels.join("、") || "暂无开启"}）。`,
            type: "security",
            isRead: false,
            createdAt: new Date(),
          },
        }).catch((e) => console.warn("写入配置变更通知非致命提示:", e));
      }
    } catch (logErr) {
      console.warn("记录配置变更审计失败:", logErr);
    }

    return NextResponse.json({
      success: true,
      message: "系统全局配置已成功保存并持久化生效",
    });
  } catch (error: any) {
    console.error("保存系统配置失败:", error);
    // 过滤 Turbopack 内部编译器路径杂音，向前端交付标准友好的中文错误反馈
    let userMsg = "保存配置失败，请检查填写内容或数据库状态";
    const rawMsg = String(error?.message || "");
    if (rawMsg.includes("too long")) {
      userMsg = "配置项文本内容过长，超出数据库字段承载上限";
    } else if (rawMsg.includes("denied") || rawMsg.includes("permission")) {
      userMsg = "数据库写入权限不足";
    }
    return NextResponse.json(
      { error: userMsg, details: rawMsg },
      { status: 500 }
    );
  }
}
