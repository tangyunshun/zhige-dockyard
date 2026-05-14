﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿/**
 * 用户活跃状态管理 Hook
 * 用于检测用户登录状态并处理会话超时、强制下线等情况
 * 
 * 处理场景：
 * 1. SESSION_TIMEOUT: 用户超过 5 分钟未操作，返回登录页
 * 2. FORCED_LOGOUT: 用户被管理员强制下线，返回登录页
 * 3. ACCOUNT_DISABLED: 用户账号状态异常，返回登录页
 * 4. 其他网络错误，仅记录日志
 */

export function updateUserActivity() {
  const userId = typeof window !== "undefined" ? localStorage.getItem("userId") : null;
  
  if (!userId) {
    return;
  }

  // 更新用户活跃状态
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
        
        console.log(`[useUserActivity] 用户会话状态: ${errorCode} (状态码: ${res.status})`);
        
        // 判断是否需要跳转到登录页
        const shouldRedirect = 
          errorCode === "SESSION_TIMEOUT" ||      // 会话超时
          errorCode === "FORCED_LOGOUT" ||        // 被强制下线
          errorCode === "ACCOUNT_DISABLED" ||     // 账号状态异常
          res.status === 401 ||                   // 未授权
          res.status === 403;                     // 禁止访问
        
        if (shouldRedirect) {
          console.log(`[useUserActivity] 用户会话${errorCode}过期，准备跳转登录页`);
          
          // 清除 localStorage
          localStorage.removeItem("userId");
          localStorage.removeItem("userRole");
          localStorage.removeItem("auth_token");
          localStorage.removeItem("userEmail");
          localStorage.removeItem("userName");
          
          // 清除 sessionStorage
          sessionStorage.clear();
          
          // 跳转到首页
          window.location.href = "/";
          return;
        }
        
        // 其他错误，仅记录日志
        console.error(`[useUserActivity] 用户活跃状态检查失败: ${errorData.message || errorCode}`);
        return;
      }
      
      // 更新活跃状态成功
      console.log("[useUserActivity] 用户活跃状态已更新");
    })
    .catch((err) => {
      // 网络错误，仅记录日志
      console.error("[useUserActivity] 用户活跃状态更新失败:", err);
    });
}
