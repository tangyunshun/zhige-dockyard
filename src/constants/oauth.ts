/**
 * 第三方联合登录渠道元数据与认证模式规范 (OAuth Channels & Auth Modes)
 * 
 * 严格遵照各开放平台标准规则分类：
 * 1. 纯扫码型 (qrcode)：微信开放平台 PC 网页端标准扫码
 * 2. 纯跳转型 (redirect)：GitHub、Gitee、Google 等标准 OAuth2 网页重定向
 * 3. 混合双模型 (hybrid)：QQ 互联、新浪微博、企业飞书、钉钉、支付宝等，支持弹窗扫码与网页跳转
 */

export type OAuthAuthMode = "qrcode" | "redirect" | "hybrid";

export interface OAuthChannelMeta {
  id: string;
  type: string;
  name: string;
  authMode: OAuthAuthMode;
  brandColor: string;
  bgLightColor: string;
  textColor: string;
  iconType: "wechat" | "github" | "qq" | "weibo" | "feishu" | "dingtalk" | "alipay" | "gitee" | "google" | "custom";
  iconUrl?: string; // public/icons 目录下的官方品牌图标
  hint: string;
  defaultCallback: string;
  domestic: boolean; // 是否属于国内主流平台
}

export const OAUTH_CHANNEL_METAS: Record<string, OAuthChannelMeta> = {
  wechat: {
    id: "wechat",
    type: "wechat",
    name: "微信扫码安全登录",
    authMode: "qrcode",
    brandColor: "#07c160",
    bgLightColor: "#e8f8f0",
    textColor: "#07c160",
    iconType: "wechat",
    iconUrl: "/icons/wechat.png",
    hint: "请使用微信 App 扫描二维码安全登录",
    defaultCallback: "/api/auth/wechat/callback",
    domestic: true,
  },
  github: {
    id: "github",
    type: "github",
    name: "GitHub 开发者授权登录",
    authMode: "redirect",
    brandColor: "#24292e",
    bgLightColor: "#f3f4f6",
    textColor: "#24292e",
    iconType: "github",
    hint: "跳转至 GitHub 官方进行 OAuth2 授权",
    defaultCallback: "/api/auth/github/callback",
    domestic: false,
  },
  qq: {
    id: "qq",
    type: "qq",
    name: "QQ 互联快捷登录",
    authMode: "hybrid",
    brandColor: "#1296db",
    bgLightColor: "#e6f7ff",
    textColor: "#1296db",
    iconType: "qq",
    iconUrl: "/icons/QQ.png",
    hint: "支持 QQ 手机版扫码登录或网页一键授权",
    defaultCallback: "/api/auth/qq/callback",
    domestic: true,
  },
  weibo: {
    id: "weibo",
    type: "weibo",
    name: "新浪微博账号登录",
    authMode: "hybrid",
    brandColor: "#e6162d",
    bgLightColor: "#fff1f0",
    textColor: "#e6162d",
    iconType: "weibo",
    iconUrl: "/icons/xinlang.png",
    hint: "支持微博客户端扫码或网页快捷授权",
    defaultCallback: "/api/auth/weibo/callback",
    domestic: true,
  },
  feishu: {
    id: "feishu",
    type: "feishu",
    name: "飞书企业扫码登录",
    authMode: "hybrid",
    brandColor: "#00d6b9",
    bgLightColor: "#e6fffb",
    textColor: "#009a85",
    iconType: "feishu",
    hint: "使用飞书 App 扫描二维码或企业 SSO 登录",
    defaultCallback: "/api/auth/feishu/callback",
    domestic: true,
  },
  dingtalk: {
    id: "dingtalk",
    type: "dingtalk",
    name: "钉钉企业免登与扫码",
    authMode: "hybrid",
    brandColor: "#0089ff",
    bgLightColor: "#e6f4ff",
    textColor: "#0089ff",
    iconType: "dingtalk",
    hint: "支持钉钉手机端扫码或工作台免登进入",
    defaultCallback: "/api/auth/dingtalk/callback",
    domestic: true,
  },
  alipay: {
    id: "alipay",
    type: "alipay",
    name: "支付宝快捷安全登录",
    authMode: "hybrid",
    brandColor: "#1677ff",
    bgLightColor: "#e6f4ff",
    textColor: "#1677ff",
    iconType: "alipay",
    iconUrl: "/icons/alipay.png",
    hint: "使用支付宝 App 扫描二维码或网页授权",
    defaultCallback: "/api/auth/alipay/callback",
    domestic: true,
  },
  gitee: {
    id: "gitee",
    type: "gitee",
    name: "Gitee 码云联合登录",
    authMode: "redirect",
    brandColor: "#c71d23",
    bgLightColor: "#fff1f0",
    textColor: "#c71d23",
    iconType: "gitee",
    hint: "跳转至 Gitee 码云平台进行 OAuth2 授权",
    defaultCallback: "/api/auth/gitee/callback",
    domestic: true,
  },
  google: {
    id: "google",
    type: "google",
    name: "Google 账号联合登录",
    authMode: "redirect",
    brandColor: "#ea4335",
    bgLightColor: "#fff2f0",
    textColor: "#ea4335",
    iconType: "google",
    hint: "跳转至 Google 账号进行授权登录",
    defaultCallback: "/api/auth/google/callback",
    domestic: false,
  },
};

/**
 * 获取渠道的认证模式元数据（找不到时默认按扫码/混合规则兜底）
 */
export function getOAuthChannelMeta(typeOrId: string): OAuthChannelMeta {
  const normalized = (typeOrId || "").toLowerCase();
  if (OAUTH_CHANNEL_METAS[normalized]) {
    return OAUTH_CHANNEL_METAS[normalized];
  }
  return {
    id: normalized,
    type: normalized,
    name: "自定义第三方登录",
    authMode: "hybrid",
    brandColor: "#3182ce",
    bgLightColor: "#ebf8ff",
    textColor: "#3182ce",
    iconType: "custom",
    hint: "支持扫码或跳转授权登录",
    defaultCallback: `/api/auth/${normalized}/callback`,
    domestic: true,
  };
}
