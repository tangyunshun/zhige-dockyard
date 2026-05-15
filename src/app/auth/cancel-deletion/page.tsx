"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { useToast } from "@/components/Toast";
import {
  ArrowLeft,
  AlertTriangle,
  CheckCircle,
  Clock,
} from "lucide-react";

export default function CancelDeletionPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [daysRemaining, setDaysRemaining] = useState<number | null>(null);
  const [checkComplete, setCheckComplete] = useState(false);

  useEffect(() => {
    checkAccountStatus();
  }, []);

  const checkAccountStatus = async () => {
    try {
      const userId = localStorage.getItem("userId");
      if (!userId) {
        router.push("/auth/login");
        return;
      }

      const res = await fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${userId}` },
      });

      if (res.ok) {
        const data = await res.json();
        if (data.user?.status === "deleting") {
          setDaysRemaining(data.user.deletionDaysRemaining || 7);
          setCheckComplete(true);
        } else {
          router.push("/");
        }
      } else {
        router.push("/auth/login");
      }
    } catch (error) {
      console.error("Check status error:", error);
      router.push("/auth/login");
    }
  };

  const handleCancelDeletion = async () => {
    setLoading(true);
    try {
      const userId = localStorage.getItem("userId");
      if (!userId) {
        router.push("/auth/login");
        return;
      }

      const res = await fetch("/api/user/cancel-deletion", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userId}`,
        },
      });

      if (res.ok) {
        toast.success("撤销成功，您的账号已恢复正常");
        setTimeout(() => {
          router.push("/");
        }, 1500);
      } else {
        const data = await res.json();
        toast.error(data.error || "撤销失败");
      }
    } catch (error) {
      console.error("Cancel deletion error:", error);
      toast.error("撤销失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  if (!checkComplete) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#eaf4fc] via-[#f0f8ff] to-[#e6f4f1] flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-300 border-t-blue-500 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">检查账号状态中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#eaf4fc] via-[#f0f8ff] to-[#e6f4f1] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8">
        <div className="text-center mb-6">
          <button
            onClick={() => router.push("/")}
            className="group flex items-center gap-1.5 text-slate-600 hover:text-[#3182ce] transition-colors text-sm mb-4 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
            返回首页
          </button>
          <Logo variant="dark" />
        </div>

        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-full bg-orange-100 flex items-center justify-center mx-auto mb-4">
            <Clock className="w-8 h-8 text-orange-500" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800 mb-2">
            账号注销申请中
          </h1>
          <p className="text-slate-600">
            您的账号已进入冷静期，还剩{" "}
            <span className="text-orange-500 font-bold">{daysRemaining}</span> 天
          </p>
        </div>

        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 mb-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-orange-500 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-orange-700">
              <p className="font-medium mb-1">冷静期说明：</p>
              <ul className="space-y-1 text-orange-600">
                <li>• 普通用户：7天冷静期</li>
                <li>• 付费会员：30天冷静期</li>
                <li>• 冷静期内账号数据保留，可随时撤销</li>
                <li>• 冷静期结束后，账号将被永久删除</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6">
          <div className="flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-green-700">
              <p className="font-medium mb-1">撤销后可恢复正常：</p>
              <ul className="space-y-1 text-green-600">
                <li>• 所有数据完整保留</li>
                <li>• 账号状态恢复正常</li>
                <li>• 可继续使用所有功能</li>
              </ul>
            </div>
          </div>
        </div>

        <button
          onClick={handleCancelDeletion}
          disabled={loading}
          className="w-full bg-gradient-to-r from-[#3182ce] to-[#2563eb] text-white py-3 rounded-xl font-medium hover:shadow-lg hover:shadow-[#3182ce]/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              <span>撤销中...</span>
            </>
          ) : (
            <>
              <CheckCircle className="w-4 h-4" />
              <span>撤销注销申请</span>
            </>
          )}
        </button>

        <p className="text-center text-sm text-slate-500 mt-4">
          撤销后您的账号将恢复正常，可继续使用所有功能
        </p>
      </div>
    </div>
  );
}