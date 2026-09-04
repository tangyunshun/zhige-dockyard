"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { X, RefreshCw, Smartphone, CheckCircle2, ShieldCheck, ArrowUpRight, Zap, Loader2 } from "lucide-react";
import Image from "next/image";
import { useToast } from "@/components/Toast";
import type { OAuthChannelMeta } from "@/constants/oauth";

interface OAuthQRCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  channel: OAuthChannelMeta | null;
  onSwitchToRedirect?: (channel: OAuthChannelMeta) => void;
}

export default function OAuthQRCodeModal({
  isOpen,
  onClose,
  channel,
  onSwitchToRedirect,
}: OAuthQRCodeModalProps) {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [qrImageUrl, setQrImageUrl] = useState<string>("");
  const [qrToken, setQrToken] = useState<string>("");
  const [status, setStatus] = useState<"loading" | "pending" | "scanned" | "confirmed" | "expired">("loading");
  const [countdown, setCountdown] = useState(300);
  const [simulating, setSimulating] = useState(false);

  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 清除所有定时器
  const clearTimers = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
  }, []);

  // 生成/刷新扫码会话
  const initQRCode = useCallback(async () => {
    if (!channel) return;
    try {
      clearTimers();
      setLoading(true);
      setStatus("loading");

      const res = await fetch("/api/auth/qrcode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: channel.type, action: "create" }),
      });

      if (!res.ok) {
        throw new Error("生成二维码失败");
      }

      const data = await res.json();
      setQrImageUrl(data.qrImageUrl);
      setQrToken(data.qrToken);
      setCountdown(data.expireSeconds || 300);
      setStatus("pending");
      setLoading(false);
    } catch (e: any) {
      setLoading(false);
      setStatus("expired");
      toast.error(e?.message || "二维码加载失败，请重试");
    }
  }, [channel, clearTimers, toast]);

  // 登录成功落库处理
  const handleLoginSuccess = useCallback((token: string, user: any) => {
    clearTimers();
    setStatus("confirmed");
    toast.success(`【${channel?.name || "第三方"}】扫码登录成功，正在进入工作空间中枢...`);

    // 存储权威鉴权凭证
    if (token) {
      localStorage.setItem("auth_token", token);
      document.cookie = `auth_token=${token}; path=/; max-age=86400; SameSite=Lax`;
    }
    if (user) {
      localStorage.setItem("userId", user.id);
      if (user.role) localStorage.setItem("userRole", user.role);
      if (user.sessionToken) localStorage.setItem("sessionToken", user.sessionToken);
    }
    sessionStorage.setItem("hasActiveSession", "true");

    const savedPath = sessionStorage.getItem("redirectAfterLogin");
    sessionStorage.removeItem("redirectAfterLogin");
    const targetPath = savedPath && savedPath !== "/auth/login" ? savedPath : "/workspace-hub";

    // 使用整页硬跳转，彻底消除 SPA 状态不同步导致的重定向回弹
    setTimeout(() => {
      window.location.href = targetPath;
    }, 600);
  }, [channel, clearTimers, toast]);

  // 启动轮询检查
  useEffect(() => {
    if (!isOpen || !qrToken || status === "confirmed" || status === "expired") {
      return;
    }

    pollTimerRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/auth/qrcode?token=${qrToken}`, {
          cache: "no-store",
        });
        if (res.ok) {
          const data = await res.json();
          if (data.status === "confirmed") {
            handleLoginSuccess(data.token, data.user);
          } else if (data.status === "scanned") {
            setStatus("scanned");
          } else if (data.status === "expired") {
            setStatus("expired");
            clearTimers();
          }
        }
      } catch (e) {
        // 忽略网络瞬断
      }
    }, 1500);

    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
      }
    };
  }, [isOpen, qrToken, status, handleLoginSuccess, clearTimers]);

  // 启动倒计时
  useEffect(() => {
    if (!isOpen || status !== "pending") return;

    countdownTimerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearTimers();
          setStatus("expired");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
      }
    };
  }, [isOpen, status, clearTimers]);

  // 当弹窗打开时自动初始化
  useEffect(() => {
    if (isOpen && channel) {
      initQRCode();
    } else {
      clearTimers();
      setStatus("loading");
    }
    return () => clearTimers();
  }, [isOpen, channel, initQRCode, clearTimers]);

  // 模拟手机一键确认（用于本地测试或无企业资质环境的快速体验）
  const handleMockConfirm = async () => {
    if (!qrToken) return;
    try {
      setSimulating(true);
      const res = await fetch("/api/auth/qrcode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: qrToken, action: "mock_confirm" }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        handleLoginSuccess(data.token, data.user);
      } else {
        toast.error(data.error || "模拟扫码授权失败");
      }
    } catch (e: any) {
      toast.error(e?.message || "网络异常");
    } finally {
      setSimulating(false);
    }
  };

  if (!isOpen || !channel) return null;

  // 渲染渠道官方徽标图标
  const renderChannelLogo = () => {
    // 优先使用 public/icons 目录下的官方品牌图标
    if (channel.iconUrl) {
      return (
        <div className="w-10 h-10 rounded-xl bg-white border border-slate-100 p-1 flex items-center justify-center shadow-xs">
          <img
            src={channel.iconUrl}
            alt={channel.name}
            className="w-full h-full object-contain"
          />
        </div>
      );
    }
    if (channel.type === "wechat") {
      return (
        <div className="w-10 h-10 rounded-xl bg-white border border-slate-100 p-1 flex items-center justify-center shadow-xs">
          <img src="/icons/wechat.png" alt="微信" className="w-full h-full object-contain" />
        </div>
      );
    }
    if (channel.type === "qq") {
      return (
        <div className="w-10 h-10 rounded-xl bg-white border border-slate-100 p-1 flex items-center justify-center shadow-xs">
          <img src="/icons/QQ.png" alt="QQ" className="w-full h-full object-contain" />
        </div>
      );
    }
    if (channel.type === "weibo") {
      return (
        <div className="w-10 h-10 rounded-xl bg-white border border-slate-100 p-1 flex items-center justify-center shadow-xs">
          <img src="/icons/xinlang.png" alt="微博" className="w-full h-full object-contain" />
        </div>
      );
    }
    if (channel.type === "alipay") {
      return (
        <div className="w-10 h-10 rounded-xl bg-white border border-slate-100 p-1 flex items-center justify-center shadow-xs">
          <img src="/icons/alipay.png" alt="支付宝" className="w-full h-full object-contain" />
        </div>
      );
    }
    if (channel.type === "feishu") {
      return (
        <div className="w-10 h-10 rounded-xl bg-[#00d6b9] text-white flex items-center justify-center font-black text-sm shadow-sm">
          飞书
        </div>
      );
    }
    if (channel.type === "dingtalk") {
      return (
        <div className="w-10 h-10 rounded-xl bg-[#0089ff] text-white flex items-center justify-center font-black text-sm shadow-sm">
          钉钉
        </div>
      );
    }
    return (
      <div className="w-10 h-10 rounded-xl bg-[#3182ce] text-white flex items-center justify-center font-black text-sm shadow-sm">
        SSO
      </div>
    );
  };

  const formatCountdown = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden text-slate-800 animate-in zoom-in-95 duration-200">
        {/* 顶部彩色品牌条与关闭按钮 */}
        <div
          className="h-2 w-full transition-colors"
          style={{ backgroundColor: channel.brandColor || "#3182ce" }}
        />
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all cursor-pointer"
          title="关闭"
        >
          <X className="w-4 h-4" />
        </button>

        {/* 弹窗核心区域 */}
        <div className="p-6 text-center">
          {/* 渠道信息 Header */}
          <div className="flex flex-col items-center mb-4">
            {renderChannelLogo()}
            <h3 className="mt-3 text-base font-bold text-slate-800 flex items-center gap-1.5">
              <span>{channel.name}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-normal">
                安全扫码
              </span>
            </h3>
            <p className="text-xs text-slate-500 mt-1">{channel.hint}</p>
          </div>

          {/* 二维码卡片容器 */}
          <div className="relative mx-auto w-56 h-56 p-3 bg-white rounded-2xl border border-slate-200 shadow-inner flex items-center justify-center group overflow-hidden">
            {loading ? (
              <div className="flex flex-col items-center justify-center text-slate-400 gap-2">
                <Loader2 className="w-8 h-8 animate-spin text-[#3182ce]" />
                <span className="text-xs">正在生成安全二维码...</span>
              </div>
            ) : status === "expired" ? (
              <div className="absolute inset-0 bg-white/95 backdrop-blur-[2px] flex flex-col items-center justify-center p-4 z-10">
                <p className="text-xs font-semibold text-slate-700 mb-2">二维码已失效</p>
                <button
                  onClick={initQRCode}
                  className="px-3.5 py-1.5 bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-xs font-bold rounded-lg shadow-sm flex items-center gap-1.5 cursor-pointer transition-all active:scale-95"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  点击刷新
                </button>
              </div>
            ) : status === "scanned" ? (
              <div className="absolute inset-0 bg-white/95 backdrop-blur-[2px] flex flex-col items-center justify-center p-4 z-10">
                <CheckCircle2 className="w-10 h-10 text-emerald-500 mb-2 animate-bounce" />
                <p className="text-sm font-bold text-slate-800">已成功扫码</p>
                <p className="text-xs text-slate-500 mt-1">请在手机端点击【确认登录】</p>
              </div>
            ) : status === "confirmed" ? (
              <div className="absolute inset-0 bg-white/95 backdrop-blur-[2px] flex flex-col items-center justify-center p-4 z-10">
                <CheckCircle2 className="w-12 h-12 text-emerald-500 mb-2" />
                <p className="text-sm font-black text-slate-800">登录成功</p>
                <p className="text-xs text-slate-500 mt-1">正在极速跳转...</p>
              </div>
            ) : (
              <>
                {/* 正常展示二维码图片 */}
                {qrImageUrl && (
                  <img
                    src={qrImageUrl}
                    alt="登录二维码"
                    className="w-full h-full object-contain rounded-lg transition-transform group-hover:scale-105"
                  />
                )}
                {/* 动态高科技激光扫描线光效 */}
                <div className="absolute inset-x-3 top-3 h-0.5 bg-gradient-to-r from-transparent via-[#3182ce] to-transparent opacity-80 animate-pulse pointer-events-none" />
              </>
            )}
          </div>

          {/* 状态与倒计时 */}
          <div className="mt-3 flex items-center justify-center gap-1.5 text-xs text-slate-500">
            {status === "pending" && (
              <>
                <Smartphone className="w-3.5 h-3.5 text-slate-400 animate-pulse" />
                <span>二维码有效时间：</span>
                <span className="font-mono font-bold text-[#3182ce]">{formatCountdown(countdown)}</span>
              </>
            )}
            {status === "scanned" && (
              <span className="text-emerald-600 font-semibold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> 等待手机确认中
              </span>
            )}
          </div>

          {/* 模拟扫码确认体验通道（在无真实手机或真机联调时一键完成闭环） */}
          <div className="mt-4 pt-3 border-t border-slate-100 flex flex-col gap-2">
            <button
              onClick={handleMockConfirm}
              disabled={simulating || status === "confirmed" || status === "expired"}
              className="w-full h-9 bg-slate-50 hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 text-xs font-semibold rounded-xl border border-slate-200 hover:border-emerald-300 transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              title="模拟手机端完成扫码授权（无需手机App，秒级验证）"
            >
              {simulating ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Zap className="w-3.5 h-3.5 text-amber-500" />
              )}
              <span>模拟手机扫码并一键确认登录</span>
            </button>

            {/* 混合型渠道支持一键切换到网页跳转登录 */}
            {channel.authMode === "hybrid" && onSwitchToRedirect && (
              <button
                onClick={() => onSwitchToRedirect(channel)}
                className="w-full h-8 text-[11px] text-slate-500 hover:text-[#3182ce] hover:bg-blue-50/50 rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer"
              >
                <span>切换至网页跳转一键授权</span>
                <ArrowUpRight className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* 底部安全保障提示 */}
        <div className="px-6 py-2.5 bg-slate-50 border-t border-slate-100 flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
          <span>知阁安全中枢端到端加密与防伪保护</span>
        </div>
      </div>
    </div>
  );
}
