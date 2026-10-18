/**
 * 客户经理联系方式 —— 仅作为前端展示的兜底默认值。
 *
 * ⚠️ 真实值由后台「系统设置」配置，持久化在 systemconfig 表（contact.managers，JSON 数组，1~2 位）。
 * 前端统一通过 GET /api/contact-info 读取后台配置；本文件仅用于接口未就绪时的兜底展示，
 * 后期更换联系人 / 电话 / 邮箱，只需在后台修改，全站自动生效，无需改代码。
 */

/** 单位客户经理联系方式 */
export interface ContactManager {
  /** 客户经理姓名（展示用，可为空） */
  name: string;
  /** 咨询热线 */
  hotline: string;
  /** 商务邮箱 */
  email: string;
  /** 服务时间 */
  serviceHours: string;
  /** QQ 号（选填，配置后展示「加QQ」快捷入口） */
  qq?: string;
  /** 微信号（选填，配置后展示「复制微信号」快捷入口，支持 6~20 位字母开头 ID 或 11 位手机号） */
  wechat?: string;
  /** QQ 二维码图片链接（选填，扫码添加为主，管理员在后台上传/填写） */
  qqQr?: string;
  /** 微信二维码图片链接（选填，扫码添加为主，管理员在后台上传/填写） */
  wechatQr?: string;
}

/** 客户经理数量上限（后台最多可配置 2 位） */
export const MAX_CONTACT_MANAGERS = 2;
/** 客户经理数量下限（至少必须配置 1 位） */
export const MIN_CONTACT_MANAGERS = 1;

/** 兜底默认客户经理（后台未配置时展示） */
export const DEFAULT_CONTACT_MANAGERS: ContactManager[] = [
  {
    name: "客户经理",
    hotline: "400-900-6688",
    email: "business@zhige.com",
    serviceHours: "工作日 9:00 - 18:00",
  },
];

/** 旧版单联系方式结构（兼容保留） */
export type ContactInfo = {
  hotline: string;
  email: string;
  serviceHours: string;
};

/** 规整后台/接口返回的客户经理列表：过滤空项、截断到上限，非法输入回退默认值 */
export function normalizeContactManagers(input: unknown): ContactManager[] {
  if (!Array.isArray(input)) return [...DEFAULT_CONTACT_MANAGERS];
  const list = input
    .filter((m) => m && typeof m === "object")
    .map((m) => {
      const o = m as Record<string, unknown>;
      return {
        name: String(o.name ?? "").trim(),
        hotline: String(o.hotline ?? "").trim(),
        email: String(o.email ?? "").trim(),
        serviceHours: String(o.serviceHours ?? "").trim(),
        qq: String(o.qq ?? "").trim(),
        wechat: String(o.wechat ?? "").trim(),
        qqQr: String(o.qqQr ?? "").trim(),
        wechatQr: String(o.wechatQr ?? "").trim(),
      } satisfies ContactManager;
    })
    .filter((m) => m.hotline || m.email);
  if (list.length === 0) return [...DEFAULT_CONTACT_MANAGERS];
  return list.slice(0, MAX_CONTACT_MANAGERS);
}
