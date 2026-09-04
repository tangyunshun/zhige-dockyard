import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * 前台公开系统配置查询接口
 * 供登录页、注册页、全站公共 Header/Footer 等无需鉴权页面实时获取系统展示参数与开放登录状态
 */
export async function GET() {
  try {
    const keys = [
      "siteName",
      "siteUrl",
      "description",
      "logo",
      "copyright",
      "icpNumber",
      "oauthGithubEnabled",
      "oauthGithubClientId",
      "oauthWechatEnabled",
      "oauthWechatAppId",
      "oauthChannels",
      "footerSlogan",
      "footerSubTitle",
      "footerWechatQr",
      "footerQqQr",
      "footerWeiboQr",
      "footerPoliceIcp",
      "footerNavColumns",
    ];

    const records = await prisma.systemconfig.findMany({
      where: {
        key: { in: keys },
      },
    });

    const configMap: Record<string, string> = {};
    records.forEach((r) => {
      configMap[r.key] = r.value ?? "";
    });

    // 默认页脚数据（完全保持用户现有的内容数据）
    const defaultNavColumns = [
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
    ];

    let navColumns = defaultNavColumns;
    if (configMap.footerNavColumns) {
      try {
        navColumns = JSON.parse(configMap.footerNavColumns);
      } catch (e) {
        // 解析失败使用默认
      }
    } else {
      // 数据库中首次不存在时，自动写入持久化，符合页面展示数据必须来自真实数据库规范
      prisma.systemconfig
        .upsert({
          where: { key: "footerNavColumns" },
          update: {},
          create: {
            key: "footerNavColumns",
            value: JSON.stringify(defaultNavColumns),
          },
        })
        .catch(() => {});
    }

    // 若页脚标语不存在，也自动落库保证真实从数据库查询
    if (!configMap.footerSlogan) {
      prisma.systemconfig
        .upsert({
          where: { key: "footerSlogan" },
          update: {},
          create: {
            key: "footerSlogan",
            value: "全球领先的软件工程效能操作系统，致力于消除研发链路中的低效瓶颈，释放创造力。",
          },
        })
        .catch(() => {});
    }

    // 动态解析第三方登录渠道列表
    let channels: Array<{
      id: string;
      type: string;
      name: string;
      enabled: boolean;
      clientId?: string;
    }> = [];

    if (configMap.oauthChannels) {
      try {
        const parsed = JSON.parse(configMap.oauthChannels);
        if (Array.isArray(parsed)) {
          channels = parsed.map((c: any) => ({
            id: c.id,
            type: c.type || c.id,
            name: c.name,
            enabled: c.enabled === true || c.enabled === "true",
            clientId: c.clientId || "",
          }));
        }
      } catch (e) {}
    }

    if (channels.length === 0) {
      channels = [
        {
          id: "github",
          type: "github",
          name: "GitHub",
          enabled: configMap.oauthGithubEnabled === "true",
          clientId: configMap.oauthGithubClientId || "",
        },
        {
          id: "wechat",
          type: "wechat",
          name: "微信扫码",
          enabled: configMap.oauthWechatEnabled === "true",
          clientId: configMap.oauthWechatAppId || "",
        },
      ];
    }

    const githubChannel = channels.find((c) => c.id === "github");
    const wechatChannel = channels.find((c) => c.id === "wechat");

    return NextResponse.json({
      siteName: configMap.siteName || "知阁·舟坊",
      siteUrl: configMap.siteUrl || "https://dockyard.zhige.com",
      description: configMap.description || "企业级全生命周期软件组件工程与效能中枢平台",
      logo: configMap.logo || "/logo.png",
      copyright: configMap.copyright || "© 2026 ZhiGe OS · 知阁·舟坊 · 京ICP备 2026000000 号-1",
      icpNumber: configMap.icpNumber || "京ICP备 2026000000 号-1",
      oauth: {
        github: {
          enabled: githubChannel ? githubChannel.enabled : configMap.oauthGithubEnabled === "true",
          clientId: configMap.oauthGithubClientId || "",
        },
        wechat: {
          enabled: wechatChannel ? wechatChannel.enabled : configMap.oauthWechatEnabled === "true",
          appId: configMap.oauthWechatAppId || "",
        },
        channels: channels.filter((c) => c.enabled),
      },
      footer: {
        slogan: configMap.footerSlogan || "全球领先的软件工程效能操作系统，致力于消除研发链路中的低效瓶颈，释放创造力。",
        subTitle: configMap.footerSubTitle || "ZhiGe Dockyard",
        wechatQr: configMap.footerWechatQr || "https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=https://zhige-dockyard.com/wechat",
        qqQr: configMap.footerQqQr || "https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=https://zhige-dockyard.com/qq",
        weiboQr: configMap.footerWeiboQr || "https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=https://zhige-dockyard.com/weibo",
        policeIcp: configMap.footerPoliceIcp || "京公网安备 31000000000000 号",
        copyright: configMap.copyright || "© 2026 ZhiGe OS · 知阁·舟坊 · 京ICP备 2026000000 号-1",
        navColumns,
      },
    });
  } catch (error) {
    console.error("加载公开系统配置失败:", error);
    // 降级返回默认兜底配置
    return NextResponse.json({
      siteName: "知阁·舟坊",
      siteUrl: "https://dockyard.zhige.com",
      description: "企业级全生命周期软件组件工程与效能中枢平台",
      logo: "/logo.png",
      copyright: "© 2026 ZhiGe OS · 知阁·舟坊 · 京ICP备 2026000000 号-1",
      icpNumber: "京ICP备 2026000000 号-1",
      oauth: {
        github: { enabled: false, clientId: "" },
        wechat: { enabled: false, appId: "" },
      },
      footer: {
        slogan: "全球领先的软件工程效能操作系统，致力于消除研发链路中的低效瓶颈，释放创造力。",
        subTitle: "ZhiGe Dockyard",
        wechatQr: "https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=https://zhige-dockyard.com/wechat",
        qqQr: "https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=https://zhige-dockyard.com/qq",
        weiboQr: "https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=https://zhige-dockyard.com/weibo",
        policeIcp: "京公网安备 31000000000000 号",
        copyright: "© 2026 ZhiGe OS · 知阁·舟坊 · 京ICP备 2026000000 号-1",
        navColumns: [],
      },
    });
  }
}
