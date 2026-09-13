import { prisma } from "@/lib/prisma";
import { OAUTH_CHANNEL_METAS, type OAuthChannelMeta } from "@/constants/oauth";

/**
 * 系统设置页的可维护目录型数据
 *
 * 原先将「第三方登录平台目录」「常用导航路由」「官方标准导航/渠道模板」硬编码在前端常量里，
 * 调整一项就需要改代码发版。现统一收敛到数据库 systemconfig 表：
 *   - 首次访问自动冷启动写入官方标准种子；
 *   - 此后一律以数据库为准（空数组同样是合法结果，不会被种子"复活"）；
 *   - 管理员直接在库中维护即可生效，无需发版。
 */

export const OAUTH_PROVIDER_CATALOG_KEY = "PLATFORM_OAUTH_PROVIDER_CATALOG_V1";
export const NAV_PRESETS_KEY = "FOOTER_NAV_PRESETS_V1";
export const OFFICIAL_NAV_TEMPLATE_KEY = "PLATFORM_OFFICIAL_NAV_TEMPLATE_V1";
export const OFFICIAL_OAUTH_TEMPLATE_KEY = "PLATFORM_OFFICIAL_OAUTH_TEMPLATE_V1";
export const SMS_PROVIDER_CATALOG_KEY = "PLATFORM_SMS_PROVIDER_CATALOG_V1";

/** 短信服务商选项 */
export interface SmsProviderItem {
  value: string;
  label: string;
}

export interface NavPresetItem {
  label: string;
  url: string;
}

export interface NavColumnTemplateItem {
  title: string;
  links: NavPresetItem[];
}

export interface OfficialOAuthChannelItem {
  id: string;
  type: string;
  name: string;
  clientId: string;
  clientSecret: string;
  enabled: boolean;
  callbackUrl: string;
}

/* ============================ 官方标准种子（仅冷启动写入） ============================ */

/** 第三方登录平台目录：以 constants/oauth 的官方规范为初始种子 */
const OAUTH_PROVIDER_SEED: OAuthChannelMeta[] = Object.values(OAUTH_CHANNEL_METAS);

/** 常用站内路由推荐 */
const NAV_PRESETS_SEED: NavPresetItem[] = [
  { label: "核心模块", url: "/capabilities" },
  { label: "组件市场", url: "/market" },
  { label: "系统文档", url: "/docs" },
  { label: "帮助中心", url: "/help" },
  { label: "解决方案", url: "/solutions" },
  { label: "开发者社区", url: "/developers" },
  { label: "知识库", url: "/knowledge" },
  { label: "隐私条款", url: "/privacy-policy" },
];

/** 官方标准页脚分类导航模板 */
const OFFICIAL_NAV_SEED: NavColumnTemplateItem[] = [
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

/** 官方预置第三方登录渠道模板 */
const OFFICIAL_OAUTH_SEED: OfficialOAuthChannelItem[] = [
  {
    id: "github",
    type: "github",
    name: "GitHub 开发者授权登录",
    clientId: "",
    clientSecret: "",
    enabled: false,
    callbackUrl: "/api/auth/github/callback",
  },
  {
    id: "wechat",
    type: "wechat",
    name: "微信开放平台扫码登录",
    clientId: "",
    clientSecret: "",
    enabled: false,
    callbackUrl: "/api/auth/wechat/callback",
  },
];

/** 短信服务商目录 */
const SMS_PROVIDER_SEED: SmsProviderItem[] = [
  { value: "aliyun", label: "阿里云短信 (Aliyun SMS)" },
  { value: "tencent", label: "腾讯云短信 (Tencent Cloud SMS)" },
  { value: "huawei", label: "华为云消息短信 (Huawei Cloud)" },
  { value: "qiniu", label: "七牛云短信 (Qiniu SMS)" },
  { value: "upyun", label: "又拍云短信 (Upyun SMS)" },
  { value: "cloopen", label: "容联云通讯 (Cloopen SMS)" },
  { value: "jpush", label: "极光短信 (JPush SMS)" },
  { value: "twilio", label: "Twilio 国际短信网关" },
  { value: "custom_http", label: "自定义 HTTP 统一短信网关" },
];

/* ============================ 通用读写 ============================ */

/**
 * 读取目录：数据库中已有记录即以数据库为准；
 * 仅当记录不存在时才写入官方标准种子。
 */
async function readCatalog<T>(key: string, seed: T[]): Promise<T[]> {
  try {
    const record = await prisma.systemconfig.findUnique({ where: { key } });
    if (record && record.value) {
      const parsed = JSON.parse(record.value);
      if (Array.isArray(parsed)) return parsed as T[];
    }
    await prisma.systemconfig.upsert({
      where: { key },
      create: { key, value: JSON.stringify(seed) },
      update: { value: JSON.stringify(seed) },
    });
    return seed;
  } catch (err) {
    console.error(`读取目录配置失败 [${key}]:`, err);
    return seed;
  }
}

/** 第三方登录平台目录 */
export async function getOAuthProviderCatalog(): Promise<OAuthChannelMeta[]> {
  return readCatalog<OAuthChannelMeta>(OAUTH_PROVIDER_CATALOG_KEY, OAUTH_PROVIDER_SEED);
}

/** 常用站内路由推荐 */
export async function getNavPresets(): Promise<NavPresetItem[]> {
  return readCatalog<NavPresetItem>(NAV_PRESETS_KEY, NAV_PRESETS_SEED);
}

/** 官方标准页脚分类导航模板 */
export async function getOfficialNavTemplate(): Promise<NavColumnTemplateItem[]> {
  return readCatalog<NavColumnTemplateItem>(OFFICIAL_NAV_TEMPLATE_KEY, OFFICIAL_NAV_SEED);
}

/** 官方预置第三方登录渠道模板 */
export async function getOfficialOAuthTemplate(): Promise<OfficialOAuthChannelItem[]> {
  return readCatalog<OfficialOAuthChannelItem>(
    OFFICIAL_OAUTH_TEMPLATE_KEY,
    OFFICIAL_OAUTH_SEED
  );
}

/** 短信服务商目录 */
export async function getSmsProviders(): Promise<SmsProviderItem[]> {
  return readCatalog<SmsProviderItem>(SMS_PROVIDER_CATALOG_KEY, SMS_PROVIDER_SEED);
}

/** 持久化保存短信服务商目录至数据库 */
export async function saveSmsProviders(providers: SmsProviderItem[]): Promise<boolean> {
  try {
    await prisma.systemconfig.upsert({
      where: { key: SMS_PROVIDER_CATALOG_KEY },
      create: { key: SMS_PROVIDER_CATALOG_KEY, value: JSON.stringify(providers) },
      update: { value: JSON.stringify(providers) },
    });
    return true;
  } catch (err) {
    console.error(`保存短信服务商目录失败 [${SMS_PROVIDER_CATALOG_KEY}]:`, err);
    return false;
  }
}
