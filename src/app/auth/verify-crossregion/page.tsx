"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert, Loader2 } from "lucide-react";

const STORAGE_KEY = "crossRegionVerify";

interface PendingVerify {
  verifyToken: string;
  rememberMe: boolean;
  message?: string;
  redirect?: string;
}

export default function VerifyCrossRegionPage() {
  const router = useRouter();
  const [pending, setPending] = useState<PendingVerify | null>(null);
  const [code, setCode] = useState("");
  const [target, setTarget] = useState("");
  const [countdown, setCountdown] = useState(0);
  const [sending, setSending] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      router.replace("/auth/login");
      return;
    }
    try {
      setPending(JSON.parse(raw) as PendingVerify);
    } catch {
      sessionStorage.removeItem(STORAGE_KEY);
      router.replace("/auth/login");
    }
  }, [router]);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((v) => v - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const sendCode = async () => {
    if (!pending || sending || countdown > 0) return;
    setSending(true);
    setError("");
    try {
      const res = await fetch("/api/auth/confirm-crossregion-login", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verifyToken: pending.verifyToken }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "验证码发送失败");
        return;
      }
      setTarget(data.target || "");
      setCountdown(60);
      setNotice(
        data.devCode
          ? `验证码已发送（开发环境验证码：${data.devCode}）`
          : "验证码已发送，请注意查收",
      );
    } catch {
      setError("网络错误，请稍后重试");
    } finally {
      setSending(false);
    }
  };

  const submit = async () => {
    if (!pending || submitting) return;
    if (code.trim().length !== 6) {
      setError("请输入6位验证码");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/auth/confirm-crossregion-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          verifyToken: pending.verifyToken,
          code: code.trim(),
          rememberMe: pending.rememberMe,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || data.message || "验证失败");
        return;
      }

      if (data.user) {
        localStorage.setItem("userId", data.user.id);
        localStorage.setItem("userRole", data.user.role || "user");
        localStorage.setItem("userName", data.user.name || "");
      }
      sessionStorage.removeItem(STORAGE_KEY);
      window.location.href = pending.redirect || "/workspace-hub";
    } catch {
      setError("网络错误，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  };

  if (!pending) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f0f8ff]">
        <Loader2 className="w-6 h-6 animate-spin text-[#3182ce]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#ebf8ff] via-[#f0f8ff] to-[#ffffff] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-[16px] shadow-xl border border-gray-100 p-8">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center">
            <ShieldAlert className="w-5 h-5 text-amber-500" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-800">异地登录验证</h1>
            <p className="text-xs text-gray-500">
              {pending.message || "检测到登录环境异常，请完成身份验证"}
            </p>
          </div>
        </div>

        <p className="text-sm text-gray-600 mb-4">
          验证通过后将登录本设备，并强制下线其他已登录设备。
          {target && <span className="text-gray-800">（验证码发送至 {target}）</span>}
        </p>

        <div className="flex gap-2 mb-3">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="请输入6位验证码"
            className="flex-1 px-3 py-2 border border-gray-200 rounded-[4px] text-sm focus:outline-none focus:border-[#3182ce]"
          />
          <button
            type="button"
            onClick={sendCode}
            disabled={sending || countdown > 0}
            className="px-3 py-2 text-sm rounded-[4px] border border-[#3182ce] text-[#3182ce] disabled:opacity-50 whitespace-nowrap"
          >
            {countdown > 0 ? `${countdown}s` : sending ? "发送中..." : "获取验证码"}
          </button>
        </div>

        {error && <p className="text-sm text-red-500 mb-2">{error}</p>}
        {!error && notice && <p className="text-sm text-emerald-600 mb-2">{notice}</p>}

        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          className="w-full py-2.5 bg-[#3182ce] text-white rounded-[4px] text-sm font-medium disabled:opacity-60"
        >
          {submitting ? "验证中..." : "确认登录"}
        </button>

        <button
          type="button"
          onClick={() => {
            sessionStorage.removeItem(STORAGE_KEY);
            router.replace("/auth/login");
          }}
          className="w-full mt-3 py-2 text-sm text-gray-500"
        >
          返回登录
        </button>
      </div>
    </div>
  );
}
