/**
 * 会话与权限管控 —— PRD v2.0 全局常量与错误码
 *
 * 说明：本仓库为单体 Next.js（MySQL + 内存缓存），无独立 Redis / 网关 / WebSocket 服务。
 * 因此 PRD 中依赖 Redis 的语义（如网关黑名单、WS 推送）一律以「数据库表 + 轮询/SSE 兜底」等价实现，
 * 并在对应模块注释中标注与原意的差异。Token 双栈（AT/RT）在本仓库以 JWT(AT, 内存/ShortStorage) +
 * 数据库 refreshToken(RT) 落地。
 */

// ============ 超时与有效期（PRD 模块 A）============
/** 空闲滑动超时：无任何请求 >= 10 分钟，RT 失效（A-01） */
export const IDLE_TIMEOUT_MS = 10 * 60 * 1000;

/** 绝对硬性超时：未勾选记住我 = 8 小时（A-02/A-03） */
export const ABSOLUTE_TIMEOUT_NO_REMEMBER_MS = 8 * 60 * 60 * 1000;
/** 绝对硬性超时：勾选记住我 = 7 天（A-02/A-03） */
export const ABSOLUTE_TIMEOUT_REMEMBER_MS = 7 * 24 * 60 * 60 * 1000;

/** Access Token（JWT）有效期：5 分钟（A-06 无感刷新，前端在过期前静默换发） */
export const ACCESS_TOKEN_TTL_SECONDS = 5 * 60;

/** Refresh Token 有效期随绝对超时策略：与绝对硬超时一致（A-02/A-03/E-06） */
export function refreshTokenTtlMs(rememberMe: boolean): number {
  return rememberMe ? ABSOLUTE_TIMEOUT_REMEMBER_MS : ABSOLUTE_TIMEOUT_NO_REMEMBER_MS;
}

// ============ 风控与封禁阈值（PRD 模块 C/E）============
/** 登录失败次数达到该值转 TEMP_BANNED，锁定 5 分钟（C-03） */
export const MAX_LOGIN_ATTEMPTS = 5;
export const TEMP_BAN_DURATION_MS = 5 * 60 * 1000;

/** 密码有效期 90 天（C-04） */
export const PASSWORD_EXPIRY_DAYS = 90;
/** 密码过期缓冲期：前 3 次登录弹窗提醒，第 4 次强制拦截（C-04） */
export const PASSWORD_EXPIRY_GRACE_LOGINS = 3;

/** 账号注销冷静期默认 7 天（D-02，可通过 systemconfig 配置 account_deletion_cooldown_days） */
export const ACCOUNT_DELETION_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

/** Step-up 二次鉴权临时令牌有效期 3 分钟（E-04） */
export const STEP_UP_TOKEN_TTL_MS = 3 * 60 * 1000;

/** 网关黑名单（内存/数据库兜底）默认时长 5 分钟（E-03） */
export const GATEWAY_BLACKLIST_DEFAULT_MS = 5 * 60 * 1000;
/** 5 分钟内请求数超过该值触发网关黑名单（E-03） */
export const GATEWAY_RATE_LIMIT_COUNT = 500;

// ============ 统一错误码（PRD 四·3 约定）============
export const SESSION_ERROR_CODES = {
  /** AT 过期但 RT 有效：前端静默调用 /refresh（A-06） */
  A_401: "A-401",
  /** RT 失效 / 账号被封 / 被踢：清除缓存跳转登录（A-01/A-02/C-01/C-02） */
  A_403: "A-403",
  /** 空间成员关系已被移除：清空空间缓存跳转中控台（F-03） */
  W_001: "W-001",
  /** 触发 Step-up 二次校验：弹密码/验证码输入框（E-04） */
  S_001: "S-001",
  /** 系统维护中：展示维护页禁止请求（G-02） */
  M_503: "M-503",
} as const;

/** validateUser 内部错误码 -> 前端统一错误码 的映射（AuthCheck 使用） */
export const VALIDATE_ERROR_TO_SESSION_CODE: Record<string, string> = {
  IDLE_TIMEOUT: SESSION_ERROR_CODES.A_403,
  MULTI_LOGIN_CONFLICT: SESSION_ERROR_CODES.A_403,
  FORCED_LOGOUT: SESSION_ERROR_CODES.A_403,
  ACCOUNT_DISABLED: SESSION_ERROR_CODES.A_403,
  USER_NOT_FOUND: SESSION_ERROR_CODES.A_403,
  ACCOUNT_DELETING: SESSION_ERROR_CODES.A_403,
  SESSION_EXPIRED: SESSION_ERROR_CODES.A_403,
  PASSWORD_EXPIRED: SESSION_ERROR_CODES.A_403,
  WORKSPACE_REMOVED: SESSION_ERROR_CODES.W_001,
  MAINTENANCE_MODE: SESSION_ERROR_CODES.M_503,
  STEP_UP_REQUIRED: SESSION_ERROR_CODES.S_001,
};

/** 前端展示文案（AuthCheck 拦截器提示用） */
export const SESSION_ERROR_MESSAGES: Record<string, string> = {
  [SESSION_ERROR_CODES.A_403]: "登录状态已失效，请重新登录",
  [SESSION_ERROR_CODES.W_001]: "您已被移出该空间",
  [SESSION_ERROR_CODES.S_001]: "请完成二次身份验证",
  [SESSION_ERROR_CODES.M_503]: "系统维护中，请稍后再试",
};
