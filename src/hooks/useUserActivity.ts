/**
 * 用户活跃时间更新 Hook
 * 在用户真正操作时调用（如加载数据、提交表单等）
 * 用于判断用户在线状态
 * 
 * 处理场景：
 * 1. SESSION_TIMEOUT: 超过 5 分钟未操作 → 清除状态，跳转登录页
 * 2. FORCED_LOGOUT: 被强制下线 → 清除状态，跳转登录页
 * 3. ACCOUNT_DISABLED: 账号被禁用 → 清除状态，跳转登录页
 * 4. 其他错误：静默失败
 */

export function updateUserActivity() {
  const userId = typeof window !== "undefined" ? localStorage.getItem("userId") : null;
  
  if (!userId) {
    return;
  }

  // 异步调用，不等待结果
  fetch("/api/auth/touch", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${userId}`,
    },
  })
    .then(async (res) => {
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const errorCode = errorData.error;
        
        console.log(`[useUserActivity] 检测到错误：${errorCode} (状态码：${res.status})`);
        
        // 需要清除登录状态并跳转的错误类型
        const shouldRedirect = 
          errorCode === "SESSION_TIMEOUT" ||      // 会话超时
          errorCode === "FORCED_LOGOUT" ||        // 被强制下线
          errorCode === "ACCOUNT_DISABLED" ||     // 账号被禁用
          res.status === 401 ||                   // 未授权
          res.status === 403;                     // 禁止访问
        
        if (shouldRedirect) {
          console.log(`[useUserActivity] 检测到 ${errorCode}，清除登录状态并跳转到登录页`);
          
          // 清除本地存储
          localStorage.removeItem("userId");
          localStorage.removeItem("userRole");
          localStorage.removeItem("auth_token");
          localStorage.removeItem("userEmail");
          localStorage.removeItem("userName");
          
          // 清除 sessionStorage
          sessionStorage.clear();
          
          // 跳转到登录页
          window.location.href = "/";
          return;
        }
        
        // 其他错误，静默失败
        console.error(`[useUserActivity] 更新活跃时间失败：${errorData.message || errorCode}`);
        return;
      }
      
      // 成功更新
      console.log("[useUserActivity] 活跃时间已更新");
    })
    .catch((err) => {
      // 网络错误或其他异常，静默失败
      console.error("[useUserActivity] 更新活跃时间失败:", err);
    });
}
