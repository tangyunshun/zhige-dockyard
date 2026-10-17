/**
 * 后台接口失败信息的「人话化」呈现器。
 *
 * 背景：中间件与各接口在失败时，返回体里既有英文错误码（error 字段，如
 * PERMISSION_SERVICE_UNAVAILABLE），也常有中文说明（message 字段）。前端若直接展示
 * error，用户看到的就是看不懂的英文串，也不知道该怎么处理。
 *
 * 本模块职责：
 *  1. 已知错误码 → 准确的「原因 + 解决办法」；
 *  2. 接口自带中文说明 → 直接采用（不重复造轮子）；
 *  3. 未收录的英文码 → 兜底文案 + 保留错误码便于运维定位。
 */

export interface FriendlyError {
  /** 给人看的原因说明 */
  message: string;
  /** 解决办法（逐条展示） */
  troubleshooting: string[];
}

const hasChinese = (s: string) => /[\u4e00-\u9fa5]/.test(s);

/** 已知技术错误码 → 人话 + 解决办法 */
const CODE_MAP: Record<string, FriendlyError> = {
  PERMISSION_SERVICE_UNAVAILABLE: {
    message: "后台权限校验服务暂时不可用（属于系统瞬时波动，与你的配置无关）",
    troubleshooting: [
      "等待 3～10 秒后重试，权限规则缓存会自动恢复",
      "若反复出现：请超级管理员重启一次后端服务",
      "该问题不影响你已保存的短信/邮件等配置",
    ],
  },
  PERMISSION_RULES_UNAVAILABLE: {
    message: "后台权限规则读取失败（系统瞬时波动），暂时无法执行该操作",
    troubleshooting: [
      "等待 3～10 秒后重试",
      "若反复出现：请超级管理员检查「接口权限设置」或重启后端服务",
    ],
  },
  PERMISSION_CONTEXT_UNAVAILABLE: {
    message: "后台权限上下文读取失败（系统瞬时波动），暂时无法执行该操作",
    troubleshooting: ["等待几秒后重试", "若反复出现请联系平台运维"],
  },
  FORBIDDEN: {
    message: "当前账号没有执行该操作的权限",
    troubleshooting: [
      "请使用超级管理员账号操作",
      "或让超级管理员在「权限配置」中为本账号授予对应权限",
    ],
  },
  UNAUTHORIZED: {
    message: "登录状态已失效，请重新登录后再试",
    troubleshooting: ["点击右上角头像 → 退出登录 → 重新登录"],
  },
  INVALID_TOKEN: {
    message: "登录凭证无效，请重新登录后再试",
    troubleshooting: ["重新登录；若刚修改过密码，旧令牌会立即失效，属正常现象"],
  },
  SESSION_EXPIRED: {
    message: "登录会话已过期，请重新登录",
    troubleshooting: ["重新登录；需要长期在线可在登录时勾选「7 天内免登录」"],
  },
  IDLE_TIMEOUT: {
    message: "长时间无操作，登录已超时保护，请重新登录",
    troubleshooting: ["重新登录；需要长期在线可在登录时勾选「7 天内免登录」"],
  },
  MULTI_LOGIN_CONFLICT: {
    message: "该账号已在其他位置登录，当前会话已被顶下线",
    troubleshooting: ["重新登录即可；如需多端同时在线，请在登录时勾选「7 天内免登录」"],
  },
  FORCED_LOGOUT: {
    message: "该账号已被强制下线，请重新登录",
    troubleshooting: ["重新登录；如持续被踢，请联系超级管理员确认账号状态"],
  },
  PASSWORD_EXPIRED: {
    message: "账号密码已过期，需先修改密码才能继续操作",
    troubleshooting: ["按提示前往修改密码，完成后重试"],
  },
  ACCOUNT_DISABLED: {
    message: "账号已被禁用，无法执行该操作",
    troubleshooting: ["请联系超级管理员确认账号状态"],
  },
  USER_NOT_FOUND: {
    message: "账号不存在或已被删除",
    troubleshooting: ["请联系超级管理员确认账号状态"],
  },
  MAINTENANCE_MODE: {
    message: "系统正处于维护模式，后台操作已临时暂停",
    troubleshooting: ["等待维护结束后重试；紧急情况请联系超级管理员"],
  },
};

/**
 * 把接口失败响应翻译成人话。
 * @param data 接口返回的 JSON（通常含 error / message / troubleshooting）
 * @param fallbackMessage 完全无法识别时的兜底说明
 */
export function describeApiError(data: any, fallbackMessage: string): FriendlyError {
  const code = String(data?.error ?? "").trim();
  const raw = String(data?.message ?? "").trim();
  const tips = Array.isArray(data?.troubleshooting)
    ? data.troubleshooting.filter((x: unknown): x is string => typeof x === "string" && x.trim().length > 0)
    : [];

  // 1) 已知错误码：优先给最准确的解释（接口自带的中文说明作为补充保留）
  const mapped = code && CODE_MAP[code] ? CODE_MAP[code] : null;
  if (mapped) {
    return {
      message: hasChinese(raw) && raw !== mapped.message ? `${mapped.message}（${raw}）` : mapped.message,
      troubleshooting: tips.length > 0 ? tips : mapped.troubleshooting,
    };
  }

  // 2) 接口给了中文说明（message 或 error 本身就是中文）
  const friendlyText = hasChinese(raw) ? raw : hasChinese(code) ? code : "";
  if (friendlyText) {
    return {
      message: friendlyText,
      troubleshooting: tips.length > 0 ? tips : ["按上述原因修正后重试；若仍失败，请截图联系平台运维"],
    };
  }

  // 3) 未收录的英文码：兜底 + 保留错误码便于运维定位
  return {
    message: code ? `${fallbackMessage}（错误码：${code}）` : fallbackMessage,
    troubleshooting: tips.length > 0 ? tips : ["稍后重试；若持续失败，请带上错误码联系平台运维"],
  };
}
