"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { useToast } from "@/components/Toast";
import AppealModal from "@/components/AppealModal";
import {
  Lock,
  Phone,
  Eye,
  EyeOff,
  User,
  MessageSquare,
  CheckCircle,
  ArrowRight,
  ArrowLeft,
  Mail,
  Check,
} from "lucide-react";
import Image from "next/image";
import { getAuthToken } from "@/utils/auth";
import {
  validateAccount,
  validatePhone,
  validateEmail,
  validateSmsCode,
  getEmailSuggestions,
  getAccountType,
} from "@/lib/validators";

type LoginMethod = "password" | "sms";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();

  // ========== 所有的 useState 必须在最前面 ==========
  const [loginMethod, setLoginMethod] = useState<LoginMethod>("password");
  const [showSmsLogin, setShowSmsLogin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [hasShownError, setHasShownError] = useState(false);
  const [showAppealModal, setShowAppealModal] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [redirectPath, setRedirectPath] = useState("/");
  const [formData, setFormData] = useState({
    account: "",
    password: "",
    phone: "",
    smsCode: "",
    captcha: "",
  });
  const [smsCountdown, setSmsCountdown] = useState(0);
  const [smsMessage, setSmsMessage] = useState<string | null>(null);
  const [showCaptcha, setShowCaptcha] = useState(false);
  const [errors, setErrors] = useState<{
    account?: string;
    password?: string;
    phone?: string;
    smsCode?: string;
  }>({});
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [appealButtonInfo, setAppealButtonInfo] = useState<{
    text: string;
    isDepleted: boolean;
    hasAppeal: boolean;
    banReason?: string | null;
  }>({ text: "去申诉 →", isDepleted: false, hasAppeal: false });

  // 自动检测用户申诉状态以渲染正确的按钮
  const checkAppealButtonMeta = async (accName: string) => {
    if (!accName || !accName.trim()) return;
    try {
      const res = await fetch(`/api/account-appeal/my-appeal?account=${encodeURIComponent(accName.trim())}`);
      if (res.ok) {
        const json = await res.json();
        if (json.isDepleted) {
          setAppealButtonInfo({ text: "查看销户倒计时 →", isDepleted: true, hasAppeal: true, banReason: json.userBanMeta?.banReason });
        } else if (json.hasAppeal && json.data?.status === "pending") {
          setAppealButtonInfo({ text: " 查看申诉进度 →", isDepleted: false, hasAppeal: true, banReason: json.userBanMeta?.banReason });
        } else if (json.hasRejected) {
          setAppealButtonInfo({ text: " 查看审核结果/再次申诉 →", isDepleted: false, hasAppeal: true, banReason: json.userBanMeta?.banReason });
        } else {
          setAppealButtonInfo({ text: " 去申诉 →", isDepleted: false, hasAppeal: false, banReason: json.userBanMeta?.banReason });
        }
      }
    } catch (e) {
      console.error("Check appeal meta error:", e);
    }
  };

  useEffect(() => {
    if (formData.account) {
      checkAppealButtonMeta(formData.account);
    }
  }, [formData.account]);
  const [accountType, setAccountType] = useState<
    "phone" | "email" | "username" | "unknown"
  >("unknown");
  const [emailSuggestions, setEmailSuggestions] = useState<string[]>([]);
  const [showEmailSuggestions, setShowEmailSuggestions] = useState(false);
  const [isSelectingSuggestion, setIsSelectingSuggestion] = useState(false);
  const [accountCheckStatus, setAccountCheckStatus] = useState<{
    exists?: boolean;
    locked?: boolean;
    disabled?: boolean;
    minutesRemaining?: number;
    remainingAttempts?: number;
  }>({});
  const [lockUntil, setLockUntil] = useState<number | null>(null);
  const [lockSeconds, setLockSeconds] = useState<number>(0);
  // 同一账号关联的标识集合（账号名/邮箱/手机号）：任一被锁定则全部锁定
  const [lockedIdentifiers, setLockedIdentifiers] = useState<string[]>([]);

  // 判断某输入值是否属于已被锁定的账号（命中关联标识任一即锁定）
  const isIdentifierLocked = (value: string): boolean => {
    const v = value.trim().toLowerCase();
    if (!v) return false;
    return lockedIdentifiers.some(
      (id) => id && id.trim().toLowerCase() === v,
    );
  };

  // 账号是否处于锁定态（由锁定截止时间戳驱动）
  const isLocked = lockUntil !== null && lockUntil > Date.now();

  // 将剩余秒数格式化为 MM:SS
  const formatLockTime = (total: number) => {
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  // 锁定倒计时：每秒刷新剩余秒数；归零后自动解除锁定
  useEffect(() => {
    if (lockUntil === null) {
      setLockSeconds(0);
      return;
    }
    const syncRemaining = () => {
      const remain = Math.max(0, Math.floor((lockUntil - Date.now()) / 1000));
      setLockSeconds(remain);
      if (remain <= 0) setLockUntil(null);
    };
    syncRemaining();
    const timer = setInterval(syncRemaining, 1000);
    return () => clearInterval(timer);
  }, [lockUntil]);
  const [redirectCountdown, setRedirectCountdown] = useState<number | null>(
    null,
  );
  const [timeoutNotice, setTimeoutNotice] = useState(false);

  // ========== 所有的 useEffect 在 useState 之后 ==========

  // 监听超时退出指示
  useEffect(() => {
    const reason = searchParams.get("reason");
    if (reason === "SESSION_TIMEOUT") {
      setTimeoutNotice(true);
    }
  }, [searchParams]);

  // 获取回调参数（必须在 useEffect 之前定义）
  const errorMessage = searchParams.get("error");

  // 检查用户是否已登录，如果已登录则重定向
  useEffect(() => {
    const checkLoggedIn = async () => {
      // 快速检查：如果 localStorage 没有有效 JWT 凭证，直接显示登录页
      const authToken = getAuthToken();

      // 检查有效的 cookie token（排除空值情况）
      const cookies = document.cookie.split(";");
      let hasValidToken = false;
      for (const cookie of cookies) {
        const [name, value] = cookie.trim().split("=");
        if (name === "auth_token" && value && value.length > 0) {
          hasValidToken = true;
          break;
        }
      }

      // 必须同时具备：本地 JWT 凭证 + Cookie 会话（与中间件/刷新口径一致）
      if (!authToken || !hasValidToken) {
        console.log("登录页：未检测到登录状态，显示登录页面");
        setIsCheckingAuth(false);
        return;
      }

      // localStorage 和 Cookie 都有，调用 API 验证
      try {
        const res = await fetch("/api/auth/me", {
          headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
          credentials: "include",
        });
        if (res.ok) {
          // 用户已登录，重定向到首页或原页面
          const savedPath = sessionStorage.getItem("redirectAfterLogin");
          const redirect = savedPath || searchParams.get("redirect") || "/";
          console.log("用户已登录，重定向到:", redirect);
          window.location.href = redirect;
          return;
        }
      } catch (error) {
        console.log("用户未登录，显示登录页面");
      } finally {
        setIsCheckingAuth(false);
      }
    };

    // 使用 setTimeout 避免阻塞渲染
    const timer = setTimeout(() => {
      checkLoggedIn();
    }, 0);

    return () => clearTimeout(timer);
  }, [searchParams]);

  // 检查是否有保存的原页面 URL，以及是否是刚刚被重定向过来的
  useEffect(() => {
    const justRedirected = sessionStorage.getItem("just_redirected") === "true";
    const savedPath = sessionStorage.getItem("redirectAfterLogin");

    if (justRedirected && savedPath) {
      // 有保存的原页面 URL，使用它
      setRedirectPath(savedPath);
      console.log("登录页：使用保存的原页面 URL:", savedPath);
      // 清除标记
      sessionStorage.removeItem("just_redirected");
    } else {
      // 没有保存的原页面，使用默认值
      const redirect = searchParams.get("redirect");
      setRedirectPath(redirect || "/workspace-hub");
    }
  }, [searchParams]);

  // 显示错误提示（如果有）
  useEffect(() => {
    if (errorMessage && !hasShownError) {
      // 使用 sessionStorage 防止重复显示
      const sessionKey = `error_shown_${errorMessage}`;
      const alreadyShown = sessionStorage.getItem(sessionKey);

      if (!alreadyShown) {
        sessionStorage.setItem(sessionKey, "true");
        setHasShownError(true);
        toast.error(errorMessage);
      }
    }
  }, [errorMessage]);

  // 使用 useEffect 处理倒计时和跳转，避免在渲染期间调用 router.push
  useEffect(() => {
    if (redirectCountdown === null || redirectCountdown <= 0) return;

    if (redirectCountdown === 1) {
      // 最后 1 秒，执行跳转，带账号与 redirect 参数
      const timer = setTimeout(() => {
        router.push(
          `/auth/register?account=${encodeURIComponent(formData.account)}&redirect=${encodeURIComponent(redirectPath)}`,
        );
        setRedirectCountdown(null);
      }, 1000);
      return () => clearTimeout(timer);
    }

    // 倒计时
    const timer = setInterval(() => {
      setRedirectCountdown((prev) => {
        if (prev === null || prev <= 1) return null;
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [redirectCountdown, router, formData.account]);

  // ========== 所有条件渲染必须在所有 Hooks 之后 ==========

  // 如果正在检查登录状态，不渲染内容
  if (isCheckingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">加载中...</p>
        </div>
      </div>
    );
  }

  // 检测账号是否存在
  const checkAccount = async (account: string) => {
    const validation = validateAccount(account);
    if (!validation.valid) {
      setAccountCheckStatus({});
      return;
    }

    try {
      const res = await fetch("/api/auth/check-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account }),
      });

      const data = await res.json();

      if (!data.exists) {
        // 账号不存在：标记状态并启动 3 秒倒计时自动跳转到注册页面
        setAccountCheckStatus({
          exists: false,
        });
        setRedirectCountdown(3);
        setLockUntil(null);
        setLockedIdentifiers([]);
      } else if (data.status === "locked") {
        setAccountCheckStatus({
          exists: true,
          locked: true,
          minutesRemaining: data.minutesRemaining,
        });
        // 触发完整锁定界面（提示框+倒计时+切换账号）
        const until = data.lockedUntil
          ? new Date(data.lockedUntil).getTime()
          : Date.now() + (data.minutesRemaining || 5) * 60 * 1000;
        setLockUntil(until);
        if (Array.isArray(data.identifiers) && data.identifiers.length) {
          setLockedIdentifiers((prev) =>
            Array.from(
              new Set(
                [account, ...prev, ...data.identifiers].map((x) =>
                  String(x).trim().toLowerCase(),
                ),
              ),
            ),
          );
        } else {
          setLockedIdentifiers((prev) =>
            Array.from(new Set([account.toLowerCase(), ...prev])),
          );
        }
      } else if (data.status === "disabled") {
        setAccountCheckStatus({
          exists: true,
          disabled: true,
        });
        // 实时检测到账号被禁用，立即显示错误在用户名输入框下方
        setErrors({
          account: "账号已被禁用，请联系管理员",
        });
      } else {
        setAccountCheckStatus({ exists: true });
      }
    } catch (error) {
      console.error("Account check error:", error);
      // 不显示 toast，保持静默
    }
  };

  // 账号输入处理
  const handleAccountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setFormData({ ...formData, account: value });

    if (errors.account) {
      setErrors({ ...errors, account: undefined });
    }

    // 清除全局错误
    if (globalError) {
      setGlobalError(null);
    }

    // 清空账号检测状态（输入变化后，旧的不存在/锁定标记作废）
    if (accountCheckStatus.exists === false) {
      setAccountCheckStatus({});
      if (redirectCountdown !== null) {
        setRedirectCountdown(null);
      }
    }

    // 输入时仅判断账号类型用于图标切换，不做格式报红（避免一输入就红框）
    const type = getAccountType(value);
    setAccountType(type);

    // 若输入的标识命中已锁定账号的关联标识，立即拉取精确锁定状态并复锁
    if (lockedIdentifiers.length > 0 && isIdentifierLocked(value)) {
      checkAccount(value);
    }

    // 邮箱自动补全建议
    if (value.includes("@")) {
      const suggestions = getEmailSuggestions(value);
      setEmailSuggestions(suggestions);
      setShowEmailSuggestions(suggestions.length > 0);
    } else {
      setEmailSuggestions([]);
      setShowEmailSuggestions(false);
    }
  };

  // 账号输入框失焦时检测
  const handleAccountBlur = () => {
    setShowEmailSuggestions(false);
    // 如果正在选择邮箱建议，跳过检测
    if (isSelectingSuggestion) {
      return;
    }
    if (formData.account) {
      const validation = validateAccount(formData.account);
      if (!validation.valid) {
        setErrors({ ...errors, account: validation.message });
        return;
      }
      checkAccount(formData.account);
      checkAppealButtonMeta(formData.account);
    } else {
      // 清空则移除账号错误
      if (errors.account) setErrors({ ...errors, account: undefined });
    }
  };

  // 手机号输入框失焦时检测
  const handlePhoneBlur = async () => {
    if (formData.phone) {
      const validation = validatePhone(formData.phone);
      if (validation.valid) {
        checkAccount(formData.phone);
      }
    }
  };

  // 选择邮箱建议
  const handleEmailSuggestionClick = (suggestion: string) => {
    setIsSelectingSuggestion(true);
    // 直接使用 suggestion 更新 formData，不使用旧的 formData
    setFormData((prev) => ({
      ...prev,
      account: suggestion,
    }));
    setEmailSuggestions([]);
    setShowEmailSuggestions(false);
    setErrors({ ...errors, account: undefined });
    // 清空账号检测状态，因为用户选择了新的邮箱
    setAccountCheckStatus({});
    if (redirectCountdown !== null) {
      setRedirectCountdown(null);
    }
    // 重置标记
    setTimeout(() => setIsSelectingSuggestion(false), 100);
  };

  const sendSmsCode = async () => {
    const phoneValidation = validatePhone(formData.phone);
    if (!phoneValidation.valid) {
      setErrors({ ...errors, phone: phoneValidation.message });
      return;
    }

    setErrors({ ...errors, phone: undefined });
    setSmsMessage(null); // 清除旧的消息

    try {
      setLoading(true);
      const res = await fetch("/api/auth/send-sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: formData.phone,
          type: "login",
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setSmsCountdown(60);
        const timer = setInterval(() => {
          setSmsCountdown((prev) => {
            if (prev <= 1) {
              clearInterval(timer);
              setSmsMessage(null); // 倒计时结束时清除消息
              return 0;
            }
            const newCount = prev - 1;
            // 实时更新提示消息
            if (data.debugCode) {
              setSmsMessage(
                `验证码已发送：${data.debugCode}，${newCount}秒后可重新发送`,
              );
            } else {
              setSmsMessage(`验证码已发送，${newCount}秒后可重新发送`);
            }
            return newCount;
          });
        }, 1000);
      } else {
        // 显示错误在对应字段下方
        if (data.field === "phone") {
          setErrors({ phone: data.message || "手机号错误" });
        } else {
          setErrors({ phone: data.message || "发送失败" });
        }
      }
    } catch (error) {
      setErrors({ phone: "网络错误，请稍后重试" });
    } finally {
      setLoading(false);
    }
  };

  // 微信登录处理
  const handleWechatLogin = () => {
    // 跳转到微信授权页面
    window.location.href = "/api/auth/wechat";
  };

  // QQ 登录处理
  const handleQQLogin = () => {
    // 跳转到 QQ 授权页面
    window.location.href = "/api/auth/qq";
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    // 清除之前的错误
    setErrors({});
    setGlobalError(null);

    const newErrors: typeof errors = {};

    if (loginMethod === "password") {
      // 验证账号
      const accountValidation = validateAccount(formData.account);
      if (!accountValidation.valid) {
        newErrors.account = accountValidation.message;
      }
      // 验证密码
      if (!formData.password) {
        newErrors.password = "请输入密码";
      }
    } else {
      // 验证手机号
      const phoneValidation = validatePhone(formData.phone);
      if (!phoneValidation.valid) {
        newErrors.phone = phoneValidation.message;
      }
      // 验证验证码
      const smsCodeValidation = validateSmsCode(formData.smsCode);
      if (!smsCodeValidation.valid) {
        newErrors.smsCode = smsCodeValidation.message;
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setLoading(true);
    setErrors({});

    // 提交前统一检测锁定/禁用：无论用户名、手机、邮箱，只要该账号锁定都要拦截
    const loginIdentifier =
      loginMethod === "password" ? formData.account : formData.phone;

    if (loginIdentifier) {
      try {
        const lockRes = await fetch("/api/auth/check-account", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ account: loginIdentifier }),
        });
        const lockData = await lockRes.json();
        if (lockData.exists && lockData.status === "locked") {
          const until = lockData.lockedUntil
            ? new Date(lockData.lockedUntil).getTime()
            : Date.now() + (lockData.minutesRemaining || 5) * 60 * 1000;
          setLockUntil(until);
          if (Array.isArray(lockData.identifiers)) {
            setLockedIdentifiers((prev) =>
              Array.from(
                new Set(
                  [loginIdentifier, ...prev, ...lockData.identifiers].map((x) =>
                    String(x).trim().toLowerCase()
                  )
                )
              )
            );
          }
          setLoading(false);
          return;
        }
        if (lockData.exists && lockData.status === "disabled") {
          setErrors({ account: "账号已被禁用，请联系管理员" });
          setLoading(false);
          return;
        }
      } catch {
        // 检测失败不阻断登录，继续走正常登录流程
      }
    }

    // 清理不存在标记，避免干扰登录
    if (accountCheckStatus.exists === false) {
      setAccountCheckStatus({});
    }

    // 检查账号是否被锁定（失焦检测结果兜底）
    if (accountCheckStatus.locked) {
      setErrors({
        account: `账号已锁定，请${accountCheckStatus.minutesRemaining}分钟后再试`,
      });
      setLoading(false);
      return;
    }

    // 检查账号是否被禁用
    if (accountCheckStatus.disabled) {
      setErrors({ account: "账号已被禁用，请联系管理员" });
      setLoading(false);
      return;
    }

    try {
      const endpoint =
        loginMethod === "password" ? "/api/auth/login" : "/api/auth/login-sms";

      const payload =
        loginMethod === "password"
          ? {
            account: formData.account,
            password: formData.password,
            rememberMe,
          }
          : { phone: formData.phone, smsCode: formData.smsCode, rememberMe };

      console.log("开始登录，endpoint:", endpoint);
      console.log("payload:", payload);

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      console.log("登录响应状态:", res.status);

      const data = await res.json();
      console.log("登录响应数据:", data);

      if (res.ok) {
        console.log("登录成功，检查返回数据...");

        // D-02：账号处于注销冷静期（可撤销），跳转到撤销注销页面
        if (data.canCancelDeletion) {
          console.log(
            "账号正在注销冷静期，跳转到撤销页面，剩余天数:",
            data.deletionDaysRemaining,
          );
          if (data.user?.id) {
            localStorage.setItem("userId", data.user.id);
          }
          window.location.href = "/auth/cancel-deletion";
          return;
        }

        // 注意：token 是通过 Cookie 设置的，不需要从 response body 获取
        // 只需要检查 user 数据是否存在
        if (!data.user) {
          console.error("登录成功但未返回用户数据");
          setGlobalError("登录成功但返回数据异常");
          setLoading(false);
          return;
        }

        // 存储 userId、userRole 和 sessionToken 到 localStorage
        console.log("=== 开始保存登录信息 ===");
        console.log("data.user.id:", data.user.id);
        console.log("data.user.role:", data.user.role);
        console.log(
          "data.user.sessionToken:",
          data.user.sessionToken ? "存在" : "不存在",
        );

        // 关键修复：登录时清除之前的工作空间状态，避免状态污染
        localStorage.removeItem("personalWorkspaceDeleted");
        localStorage.removeItem("personalWorkspaceUpgraded");
        localStorage.removeItem("upgradeMode");
        // 清除退出登录标志，避免首页显示"已退出登录"
        localStorage.removeItem("just_logged_out");

        if (data.user.id) {
          localStorage.setItem("userId", data.user.id);
          console.log(
            "存储auth_token, data.token:",
            data.token ? "存在" : "不存在",
          );
          if (data.token) {
            localStorage.setItem("auth_token", data.token);
          } else if (data.user.auth_token) {
            localStorage.setItem("auth_token", data.user.auth_token);
          }
        }
        console.log(
          "存储的auth_token:",
          localStorage.getItem("auth_token") ? "成功" : "失败",
        );
        if (data.user?.role) {
          localStorage.setItem("userRole", data.user.role);
        }
        // 存储 sessionToken 用于在线状态判断
        if (data.user?.sessionToken) {
          localStorage.setItem("sessionToken", data.user.sessionToken);
        }
        // 设置 sessionStorage 标记，表示当前浏览器会话是活跃的
        sessionStorage.setItem("hasActiveSession", "true");
        // 清除退出登录标志
        sessionStorage.removeItem("is_logging_out");

        // 如果是"记住我"登录，额外标记
        if (rememberMe) {
          localStorage.setItem("rememberMe", "true");
        } else {
          localStorage.removeItem("rememberMe");
        }

        // 登录成功后，检查并创建个人空间
        try {
          const workspaceRes = await fetch("/api/workspace/create-personal", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
          });

          const workspaceData = await workspaceRes.json();

          if (!workspaceRes.ok) {
            console.warn("创建个人空间失败:", workspaceData.message);
          }
        } catch (error) {
          console.warn("创建个人空间异常:", error);
        }

        // 确保 localStorage 已经设置完成，使用 setTimeout 延迟跳转
        setTimeout(async () => {
          // 调用 /api/auth/touch 更新 lastLoginAt，确保会话活跃
          try {
            await fetch("/api/auth/touch", {
              method: "POST",
              signal: AbortSignal.timeout(3000),
            });
          } catch (touchError) {
            console.warn("/api/auth/touch 调用失败:", touchError);
          }

          // 智能判断跳转目标
          const userRole = localStorage.getItem("userRole");
          const targetPath = redirectPath;

          // 检查是否是管理员页面
          const isAdminPage = targetPath.startsWith("/admin");
          const isAdminUser =
            userRole &&
            [
              "admin",
              "super_admin",
              "superadmin",
              "ADMIN",
              "SUPERADMIN",
              "SUPER_ADMIN",
            ].includes(userRole);

          let finalPath = targetPath;

          if (isAdminPage && !isAdminUser) {
            // 普通用户尝试访问管理员页面，重定向到用户首页
            console.log("普通用户尝试访问管理员页面，重定向到用户首页");
            finalPath = "/workspace-hub";
          } else if (isAdminUser) {
            // 管理员用户：如果 URL 中有明确的 redirect 目标且不是根路径，尊重该目标
            const explicitRedirect = searchParams.get("redirect");
            if (explicitRedirect && explicitRedirect !== "/") {
              finalPath = explicitRedirect;
            } else {
              finalPath = "/workspace-hub";
            }
          } else {
            console.log("正常访问，使用原页面 URL");
            if (finalPath === "/") {
              finalPath = "/workspace-hub";
            }
          }

          // 清除保存的页面 URL
          sessionStorage.removeItem("redirectAfterLogin");

          // 跳转
          window.location.href = finalPath;
        }, 500);
      } else {
        // 处理各种错误情况，全部显示在输入框下方
        if (data.error === "IP_ABNORMAL" && data.verifyToken) {
          // 异地/异常IP登录：跳转二次验证页完成验证并挤线（场景20/21）
          sessionStorage.setItem(
            "crossRegionVerify",
            JSON.stringify({
              verifyToken: data.verifyToken,
              rememberMe,
              message: data.message,
              redirect: redirectPath === "/" ? "/workspace-hub" : redirectPath,
            }),
          );
          window.location.href = "/auth/verify-crossregion";
          return;
        }

        if (data.accountExists === false) {
          // 账号不存在：仅提示，引导手动点击注册，不自动跳转以免劫持登录
          setErrors({ account: data.message || "账号不存在，请检查后重试" });
        } else if (data.minutesRemaining) {
          // 账号被锁定（含第5次密码错误触发）：立即触发完整锁定界面
          const until = data.lockedUntil
            ? new Date(data.lockedUntil).getTime()
            : Date.now() + (data.minutesRemaining || 5) * 60 * 1000;
          setLockUntil(until);
          if (Array.isArray(data.identifiers) && data.identifiers.length) {
            setLockedIdentifiers((prev) =>
              Array.from(
                new Set(
                  [formData.account, ...prev, ...data.identifiers].map((x) =>
                    String(x).trim().toLowerCase(),
                  ),
                ),
              ),
            );
          } else if (formData.account) {
            setLockedIdentifiers((prev) =>
              Array.from(
                new Set([formData.account.toLowerCase(), ...prev]),
              ),
            );
          }
        } else if (data.remainingAttempts !== undefined) {
          // 密码错误（未达锁定阈值），显示剩余次数
          const errMsg = data.message || "账号或密码错误，请重试";
          if (data.remainingAttempts > 0) {
            setErrors({
              password: `${errMsg}，剩余${data.remainingAttempts}次尝试机会`,
            });
          } else {
            setErrors({ password: errMsg });
          }
        } else if (data.field === "password") {
          // 密码错误
          setErrors({ password: data.message || "密码错误" });
        } else if (data.field === "account") {
          // 账号字段错误
          setErrors({ account: data.message || "账号错误" });
        } else {
          const msg = data.message || "登录失败";
          setGlobalError(msg);
          if (msg.includes("封禁") || msg.includes("禁用") || msg.includes("锁定")) {
            checkAppealButtonMeta(formData.account);
          }
        }
      }
    } catch (error) {
      // 网络错误显示在登录按钮上方
      setGlobalError("网络错误，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen bg-gradient-to-br from-[#ebf8ff] via-[#f0f8ff] to-[#ffffff] flex items-center justify-center p-4 overflow-hidden relative"
      style={{
        backgroundImage: "radial-gradient(rgba(49, 130, 206, 0.08) 1.5px, transparent 1.5px)",
        backgroundSize: "24px 24px",
      }}
    >
      <div className="w-full max-w-4xl grid md:grid-cols-5 gap-0 rounded-[24px] overflow-hidden shadow-2xl bg-white/80 backdrop-blur-xl border border-white/50 relative z-10">
        {/* 左侧品牌区 - 固定 */}
        <div className="hidden md:flex md:col-span-2 flex-col justify-center items-center bg-gradient-to-br from-[#3182ce] to-[#1a365d] p-6 text-white relative overflow-hidden">
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-10 left-10 w-32 h-32 bg-white rounded-full blur-3xl" />
            <div className="absolute bottom-10 right-10 w-40 h-40 bg-[#63b3ed] rounded-full blur-3xl" />
          </div>

          <div className="relative z-10 text-center">
            <div className="w-16 h-16 mb-4 bg-white/10 rounded-2xl flex items-center justify-center backdrop-blur-sm mx-auto shadow-lg">
              <svg
                className="w-10 h-10"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 6c1.4 0 2.8 1.1 2.8 2.5V11c.6 0 1.2.6 1.2 1.2v3.5c0 .7-.6 1.3-1.2 1.3H9.2c-.6 0-1.2-.6-1.2-1.2v-3.5c0-.7.6-1.3 1.2-1.3V9.5C9.2 8.1 10.6 7 12 7zm0 1c-.8 0-1.5.7-1.5 1.5V11h3V9.5c0-.8-.7-1.5-1.5-1.5zm-1.5 5v3.5h3v-3.5h-3z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold mb-2">知阁·舟坊</h1>
            <p className="text-blue-100 mb-6 text-sm">
              全链路软件研发效能操作系统
            </p>

            <div className="space-y-3 text-left">
              <div className="flex items-center gap-2 bg-white/10 rounded-lg px-3 py-2 backdrop-blur-sm">
                <CheckCircle className="w-4 h-4 text-emerald-300" />
                <span className="text-xs">企业级安全架构</span>
              </div>
              <div className="flex items-center gap-2 bg-white/10 rounded-lg px-3 py-2 backdrop-blur-sm">
                <CheckCircle className="w-4 h-4 text-emerald-300" />
                <span className="text-xs">自动化驱动</span>
              </div>
              <div className="flex items-center gap-2 bg-white/10 rounded-lg px-3 py-2 backdrop-blur-sm">
                <CheckCircle className="w-4 h-4 text-emerald-300" />
                <span className="text-xs">全链路提效 300%</span>
              </div>
            </div>
          </div>
        </div>

        {/* 右侧表单区 */}
        <div className="md:col-span-3 p-6 md:p-8">
          <div className="mb-6 flex items-center justify-between">
            <button
              onClick={() => router.push("/")}
              className="group flex items-center gap-1.5 text-slate-600 hover:text-[#3182ce] transition-colors text-sm cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
              返回首页
            </button>
            <Logo variant="light" />
          </div>

          <div className="flex justify-between items-end mb-6">
            <div>
              <h2 className="text-xl font-bold text-slate-800 mb-1">欢迎回来</h2>
              <p className="text-slate-600 text-sm">请登录您的账号</p>
            </div>
            {/* 切换登录方式按钮：锁定状态下隐藏 */}
            {!isLocked && (
              <>
                {!showSmsLogin ? (
                  <button
                    type="button"
                    onClick={() => {
                      setShowSmsLogin(true);
                      setLoginMethod("sms");
                      setErrors({});
                    }}
                    className="text-[#3182ce] hover:text-[#2b6cb0] text-sm font-medium cursor-pointer transition-colors flex items-center gap-1.5 pb-0.5 border-b border-dashed border-[#3182ce] hover:border-[#2b6cb0]"
                  >
                    <Phone className="w-4 h-4" />
                    手机号快捷登录
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setShowSmsLogin(false);
                      setLoginMethod("password");
                      setErrors({});
                    }}
                    className="text-[#3182ce] hover:text-[#2b6cb0] text-sm font-medium cursor-pointer transition-colors flex items-center gap-1.5 pb-0.5 border-b border-dashed border-[#3182ce] hover:border-[#2b6cb0]"
                  >
                    <Lock className="w-4 h-4" />
                    账号密码登录
                  </button>
                )}
              </>
            )}
          </div>

          {timeoutNotice && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-2 text-xs text-amber-600 font-semibold mb-4 leading-normal animate-in fade-in slide-in-from-top-2 duration-200">
              ⚠️ 因长时间未操作，您已自动退出登录
            </div>
          )}

          {/* 账号冻结提示区域：密码错误超过 5 次时锁定整个账号，仅展示锁定信息 */}
          {isLocked && (
            <div className="p-4 bg-red-50 border border-red-300 rounded-xl mb-4 animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-9 h-9 rounded-full bg-red-100 flex items-center justify-center">
                  <Lock className="w-4 h-4 text-red-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-red-600">
                    账号「{formData.account}」已锁定
                  </p>
                  <p className="text-xs text-red-600 mt-0.5 leading-relaxed">
                    由于密码连续输入错误超过 5 次，系统已临时锁定该账号。锁定期间无法登录，请等待倒计时结束，或切换其他账号。
                  </p>
                  <div className="mt-2 inline-flex items-center gap-2 bg-white border border-red-200 rounded-lg px-3 py-1.5">
                    <span className="text-base font-mono font-bold text-red-600 tabular-nums">
                      {formatLockTime(lockSeconds)}
                    </span>
                    <span className="text-xs text-red-500 font-medium">后自动解锁</span>
                  </div>
                </div>
              </div>

              {/* 锁定状态下允许切换其他账号登录 */}
              <form
                className="mt-4 pt-3 border-t border-red-200"
                onSubmit={(e) => {
                  e.preventDefault();
                  const value = (e.currentTarget.elements.namedItem("otherAccount") as HTMLInputElement)?.value.trim();
                  if (!value) return;
                  // 切换到新账号：清空锁定与表单状态，重置为可登录态
                  setLockUntil(null);
                  setLockSeconds(0);
                  setLockedIdentifiers([]);
                  setFormData({ account: value, password: "", phone: "", smsCode: "", captcha: "" });
                  setAccountCheckStatus({});
                  setErrors({});
                  setGlobalError(null);
                  checkAccount(value);
                }}
              >
                <label className="block text-xs font-medium text-red-600 mb-1.5">
                  切换其他账号登录
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      name="otherAccount"
                      type="text"
                      className="w-full pl-9 pr-4 py-2.5 border border-red-200 rounded-lg text-sm bg-white outline-none focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 transition-all"
                      placeholder="请输入其他账号/邮箱/手机号"
                    />
                  </div>
                  <button
                    type="submit"
                    className="px-4 py-2.5 bg-white border border-[#3182ce] text-[#3182ce] rounded-xl text-xs font-black hover:bg-[#3182ce] hover:text-white transition-all whitespace-nowrap cursor-pointer"
                  >
                    切换账号
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* 根据 showSmsLogin 决定显示哪个表单：锁定状态下隐藏登录表单 */}
          {!isLocked && !showSmsLogin ? (
            <>
              {/* 账号密码登录表单 */}
              <form onSubmit={handleLogin} className="space-y-4">
                {/* 账号输入框 */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    账号 / 邮箱 / 手机号 <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    {accountType === "email" ? (
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    ) : accountType === "phone" ? (
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    ) : (
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    )}
                    <input
                      type="text"
                      value={formData.account}
                      onChange={handleAccountChange}
                      onBlur={handleAccountBlur}
                      className={`w-full pl-9 pr-4 py-2.5 border rounded-lg text-sm focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none transition-all duration-200 ease-in-out ${errors.account ? "border-red-500" : "border-[#e2e8f0]"
                        }`}
                      placeholder="请输入账号/邮箱/手机号"
                    />
                  </div>
                  {errors.account && !accountCheckStatus.locked && !accountCheckStatus.disabled && accountCheckStatus.exists !== false && (
                    <p className="mt-1 text-xs text-red-500">
                      {errors.account}
                    </p>
                  )}

                  {/* 邮箱自动补全建议 */}
                  {showEmailSuggestions && emailSuggestions.length > 0 && (
                    <div className="absolute z-50 w-full mt-1 bg-white border border-[#e2e8f0] rounded-lg shadow-lg pointer-events-auto">
                      {emailSuggestions.map((suggestion, index) => (
                        <button
                          key={index}
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleEmailSuggestionClick(suggestion);
                          }}
                          onMouseDown={(e) => {
                            e.preventDefault();
                          }}
                          className="w-full px-4 py-2 text-left text-sm hover:bg-[#f0f8ff] text-slate-700 first:rounded-t-lg last:rounded-b-lg cursor-pointer"
                        >
                          <Mail className="inline w-3 h-3 mr-2 text-[#3182ce]" />
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  )}
                  {/* 账号状态提示 */}
                  {accountCheckStatus.exists === false &&
                    redirectCountdown !== null && (
                      <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-between">
                        <p className="text-xs text-amber-600">
                          ⚠️ 该账号未注册，{redirectCountdown}秒后跳转注册页面
                        </p>
                        <button
                          onClick={() => {
                            setRedirectCountdown(null);
                            // 带账号与 redirect 参数跳转到注册页面
                            router.push(
                              `/auth/register?account=${encodeURIComponent(formData.account)}&redirect=${encodeURIComponent(redirectPath)}`,
                            );
                          }}
                          className="text-xs text-[#3182ce] hover:underline font-medium"
                        >
                          立即注册 →
                        </button>
                      </div>
                    )}
                  {accountCheckStatus.disabled && (
                    <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between">
                      <p className="text-xs text-red-600">
                        ⛔ 账号已被禁用，请联系管理员
                      </p>
                      <button
                        type="button"
                        onClick={() => setShowAppealModal(true)}
                        className="text-xs text-[#3182ce] hover:underline font-medium whitespace-nowrap ml-2"
                      >
                        📝 在线申诉 →
                      </button>
                    </div>
                  )}
                </div>

                {/* 密码输入框 */}
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    密码 <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type={showPassword ? "text" : "password"}
                      value={formData.password}
                      disabled={isLocked}
                      onChange={(e) => {
                        setFormData({ ...formData, password: e.target.value });
                        if (errors.password)
                          setErrors({ ...errors, password: undefined });
                      }}
                      className={`w-full pl-9 pr-10 py-2.5 border rounded-lg text-sm focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none transition-all duration-200 ease-in-out ${errors.password ? "border-red-500" : "border-[#e2e8f0]"
                        }`}
                      placeholder="请输入密码"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  {errors.password && (
                    <p className="mt-1 text-xs text-red-500">
                      {errors.password}
                    </p>
                  )}
                  <div className="flex justify-between items-center mt-1.5">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-300 text-[#3182ce] focus:ring-[#3182ce]"
                      />
                      <span className="text-xs text-slate-600 font-medium">7天内免登录</span>
                    </label>
                    <Link
                      href={`/auth/forgot-password${formData.account ? `?account=${encodeURIComponent(formData.account)}` : ""}`}
                      className="text-xs text-[#3182ce] hover:underline font-bold"
                    >
                      忘记密码？
                    </Link>
                  </div>
                </div>

                {/* 登录按钮上方的错误提示（包含封禁拦截与【去申诉】/【查看申诉进度】/【查看销户倒计时】按钮） */}
                {globalError && (
                  <div className="mt-3 p-3 bg-red-50 border border-red-200/80 rounded-xl flex items-center justify-between animate-in fade-in duration-200">
                    <p className="text-xs text-red-600 font-bold flex-1 leading-snug">{globalError}</p>
                    {(globalError.includes("封禁") || globalError.includes("禁用") || globalError.includes("锁定")) && (
                      <button
                        type="button"
                        onClick={() => setShowAppealModal(true)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer shrink-0 ml-2 shadow-2xs whitespace-nowrap ${appealButtonInfo.isDepleted
                          ? "bg-slate-900 text-amber-400 hover:bg-black"
                          : "bg-red-600 text-white hover:bg-red-700"
                          }`}
                        title="点击查看解封申诉进度或风控销户状态"
                      >
                        {appealButtonInfo.text}
                      </button>
                    )}
                  </div>
                )}

                {/* 登录按钮 */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] text-white py-3 rounded-xl font-black text-sm hover:shadow-lg hover:shadow-[#3182ce]/20 hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
                >
                  {loading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span className="font-black">登录中...</span>
                    </>
                  ) : (
                    <>
                      <span className="font-black">登录</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>


            </>
          ) : !isLocked && (
            <>
              {/* 手机号验证码登录表单 */}
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    手机号 <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => {
                        const value = e.target.value;
                        setFormData({ ...formData, phone: value });
                        if (errors.phone) {
                          setErrors({ ...errors, phone: undefined });
                        }
                        // 清空账号检测状态
                        if (accountCheckStatus.exists === false) {
                          setAccountCheckStatus({});
                          if (redirectCountdown !== null) {
                            setRedirectCountdown(null);
                          }
                        }
                        // 实时验证手机号格式
                        if (value && value.length > 0) {
                          const validation = validatePhone(value);
                          if (!validation.valid) {
                            setErrors({
                              ...errors,
                              phone: validation.message,
                            });
                          }
                        }
                      }}
                      onBlur={handlePhoneBlur}
                      className={`w-full pl-9 pr-4 py-2.5 border rounded-lg text-sm focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none transition-all duration-200 ease-in-out ${errors.phone ? "border-red-500" : "border-[#e2e8f0]"
                        }`}
                      placeholder="请输入 11 位手机号"
                    />
                    {errors.phone && (
                      <p className="mt-1 text-xs text-red-500">
                        {errors.phone}
                      </p>
                    )}
                    {/* 手机号状态提示 */}
                    {accountCheckStatus.exists === false &&
                      redirectCountdown !== null && (
                        <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-between">
                          <p className="text-xs text-amber-600">
                            ️ 该手机号未注册，{redirectCountdown}秒后跳转注册页面
                          </p>
                          <button
                            onClick={() => {
                              setRedirectCountdown(null);
                              // 带手机号与 redirect 参数跳转到注册页面
                              router.push(
                                `/auth/register?account=${encodeURIComponent(formData.phone)}&redirect=${encodeURIComponent(redirectPath)}`,
                              );
                            }}
                            className="text-xs text-[#3182ce] hover:underline font-medium"
                          >
                            立即注册 →
                          </button>
                        </div>
                      )}
                    {accountCheckStatus.locked && (
                      <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-lg">
                        <p className="text-xs text-red-600">
                          🔒 手机号已被锁定，请
                          {accountCheckStatus.minutesRemaining}
                          分钟后再试
                        </p>
                      </div>
                    )}
                    {accountCheckStatus.disabled && (
                      <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-lg">
                        <p className="text-xs text-red-600">
                          ⛔ 该手机号对应的账号已被禁用，请联系管理员
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    验证码 <span className="text-red-500">*</span>
                  </label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <MessageSquare className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="text"
                        value={formData.smsCode}
                        onChange={(e) => {
                          const value = e.target.value;
                          setFormData({ ...formData, smsCode: value });
                          if (errors.smsCode) {
                            setErrors({ ...errors, smsCode: undefined });
                          }
                          // 实时验证验证码格式（6 位数字）
                          if (value && !/^\d{0,6}$/.test(value)) {
                            return;
                          }
                          if (value.length > 0 && value.length < 6) {
                            setErrors({
                              ...errors,
                              smsCode: "验证码为 6 位数字",
                            });
                          }
                        }}
                        className={`w-full pl-9 pr-4 py-2.5 border rounded-lg text-sm focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none transition-all duration-200 ease-in-out ${errors.smsCode ? "border-red-500" : "border-[#e2e8f0]"
                          }`}
                        placeholder="请输入 6 位验证码"
                        maxLength={6}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={sendSmsCode}
                      disabled={smsCountdown > 0 || loading}
                      className="px-4 py-2.5 bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] text-white rounded-xl text-xs font-black hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap cursor-pointer"
                    >
                      {smsCountdown > 0
                        ? `${smsCountdown}秒后重发`
                        : "获取验证码"}
                    </button>
                  </div>
                  {errors.smsCode && (
                    <p className="mt-1 text-xs text-red-500">
                      {errors.smsCode}
                    </p>
                  )}
                  {smsMessage && (
                    <p className="mt-1 text-xs text-emerald-600">{smsMessage}</p>
                  )}
                </div>

                {/* 登录按钮 */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] text-white py-3 rounded-xl font-black text-sm hover:shadow-lg hover:shadow-[#3182ce]/20 hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
                >
                  {loading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span className="font-black">登录中...</span>
                    </>
                  ) : (
                    <>
                      <span className="font-black">登录</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>

            </>
          )}

          {/* 第三方登录：锁定状态下隐藏 */}
          {!isLocked && (
            <div className="mt-6 mb-4">
              <div className="relative mb-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200"></div>
                </div>
                <div className="relative flex justify-center">
                  <span className="px-4 bg-white text-slate-500 text-xs">
                    第三方账号登录
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-center gap-8">
                <button
                  type="button"
                  onClick={handleWechatLogin}
                  className="transition-all hover:scale-110"
                  title="微信扫码登录"
                >
                  <Image
                    src="/icons/wechat.png"
                    alt="微信"
                    width={32}
                    height={32}
                    className="w-8 h-8"
                  />
                </button>
                <button
                  type="button"
                  onClick={handleQQLogin}
                  className="transition-all hover:scale-110"
                  title="QQ 登录"
                >
                  <Image
                    src="/icons/QQ.png"
                    alt="QQ"
                    width={32}
                    height={32}
                    className="w-8 h-8"
                  />
                </button>
              </div>
            </div>
          )}

          <div className="text-center text-sm text-slate-600">
            还没有账号？{" "}
            <Link
              href={`/auth/register${formData.account ? `?account=${encodeURIComponent(formData.account)}` : ""}${formData.account ? "&" : "?"}redirect=${encodeURIComponent(redirectPath)}`}
              className="text-[#3182ce] font-medium hover:underline"
            >
              立即注册
            </Link>
          </div>
        </div>
      </div>

      {/* 账号申诉模态框 */}
      {showAppealModal && (
        <AppealModal
          account={formData.account}
          initialBanReason={appealButtonInfo.banReason || undefined}
          onClose={() => setShowAppealModal(false)}
        />
      )}
    </div>
  );
}

// 确保 Next.js App Router 正确扫描并编译登录页面路由
export default function LoginPage() {
  return (
    <Suspense fallback={<div>加载中...</div>}>
      <LoginForm />
    </Suspense>
  );
}
