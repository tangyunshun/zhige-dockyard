// 认证工具：统一读取本地会话凭证
// token 由登录/刷新流程写入 localStorage，键名为 "auth_token"，
// 真实用户 ID 由登录流程写入 "userId"（本地标识，不作为请求凭证使用）。

const TOKEN_KEY = "auth_token";
const USER_ID_KEY = "userId";

/**
 * 获取当前访问令牌（JWT）。
 * SSR 或 localStorage 不可用时返回空字符串，调用方据此省略 Authorization 头。
 */
export function getAuthToken(): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

/**
 * 获取当前登录用户 ID（本地标识）。
 * 仅用于本地展示/比对（如空间成员列表判断"是否自己"），不作为请求凭证。
 */
export function getCurrentUserId(): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(USER_ID_KEY) || "";
  } catch {
    return "";
  }
}
