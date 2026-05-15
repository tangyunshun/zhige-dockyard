"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  User,
  Settings,
  CreditCard,
  FolderOpen,
  Box,
  ArrowRight,
} from "lucide-react";

export default function UserQuickAccess() {
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userName, setUserName] = useState("");

  useEffect(() => {
    const userId = localStorage.getItem("userId");
    if (userId) {
      setIsLoggedIn(true);
      // 获取用户名
      fetchUserInfo();
    }
  }, []);

  const fetchUserInfo = async () => {
    try {
      const userId = localStorage.getItem("userId");
      const res = await fetch("/api/auth/me", {
        headers: {
          Authorization: `Bearer ${userId}`,
        },
      });

      if (res.ok) {
        const data = await res.json();
        setUserName(data.user?.name || "");
      }
    } catch (error) {
      console.error("Fetch user info error:", error);
    }
  };

  if (!isLoggedIn) {
    return null;
  }

  return (
    <section className="py-16 bg-gradient-to-br from-white via-blue-50/30 to-white relative overflow-hidden">
      {/* 装饰背景 */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-gradient-to-r from-[#3182ce]/10 to-[#2563eb]/10 opacity-50 blur-[80px] pointer-events-none"></div>

      <div className="max-w-6xl mx-auto px-6 relative z-10">
        {/* 标题区 */}
        <div className="text-center mb-10">
          <h2 className="text-3xl font-bold text-slate-800 mb-3">
            欢迎回来，{userName || "用户"}
          </h2>
          <p className="text-slate-500 text-lg">
            快速访问您的个人工作空间
          </p>
        </div>

        {/* 快捷入口卡片 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* 个人工作台 */}
          <button
            onClick={() => router.push("/user/dashboard")}
            className="group p-6 bg-white rounded-2xl shadow-lg shadow-[#3182ce]/10 border border-slate-200 hover:shadow-xl hover:shadow-[#3182ce]/20 hover:border-[#3182ce]/30 transition-all duration-300 hover:-translate-y-1 text-left"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center group-hover:scale-110 transition-transform">
                <User className="w-6 h-6 text-white" />
              </div>
              <ArrowRight className="w-5 h-5 text-slate-400 group-hover:text-[#3182ce] group-hover:translate-x-1 transition-all" />
            </div>
            <h3 className="text-lg font-bold text-slate-800 mb-2">
              个人工作台
            </h3>
            <p className="text-sm text-slate-500">
              查看数据概览、快捷操作和最近活动
            </p>
          </button>

          {/* 个人设置 */}
          <button
            onClick={() => router.push("/user/profile")}
            className="group p-6 bg-white rounded-2xl shadow-lg shadow-[#3182ce]/10 border border-slate-200 hover:shadow-xl hover:shadow-[#3182ce]/20 hover:border-[#3182ce]/30 transition-all duration-300 hover:-translate-y-1 text-left"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#10b981] to-[#059669] flex items-center justify-center group-hover:scale-110 transition-transform">
                <Settings className="w-6 h-6 text-white" />
              </div>
              <ArrowRight className="w-5 h-5 text-slate-400 group-hover:text-[#10b981] group-hover:translate-x-1 transition-all" />
            </div>
            <h3 className="text-lg font-bold text-slate-800 mb-2">
              个人设置
            </h3>
            <p className="text-sm text-slate-500">
              管理个人信息、头像和账号安全
            </p>
          </button>

          {/* 会员信息 */}
          <button
            onClick={() => router.push("/user/membership")}
            className="group p-6 bg-white rounded-2xl shadow-lg shadow-[#f59e0b]/10 border border-slate-200 hover:shadow-xl hover:shadow-[#f59e0b]/20 hover:border-[#f59e0b]/30 transition-all duration-300 hover:-translate-y-1 text-left"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#f59e0b] to-[#d97706] flex items-center justify-center group-hover:scale-110 transition-transform">
                <CreditCard className="w-6 h-6 text-white" />
              </div>
              <ArrowRight className="w-5 h-5 text-slate-400 group-hover:text-[#f59e0b] group-hover:translate-x-1 transition-all" />
            </div>
            <h3 className="text-lg font-bold text-slate-800 mb-2">
              会员信息
            </h3>
            <p className="text-sm text-slate-500">
              查看会员等级、配额使用和权益详情
            </p>
          </button>

          {/* 工作空间 */}
          <button
            onClick={() => router.push("/workspace-hub")}
            className="group p-6 bg-white rounded-2xl shadow-lg shadow-[#8b5cf6]/10 border border-slate-200 hover:shadow-xl hover:shadow-[#8b5cf6]/20 hover:border-[#8b5cf6]/30 transition-all duration-300 hover:-translate-y-1 text-left"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#8b5cf6] to-[#7c3aed] flex items-center justify-center group-hover:scale-110 transition-transform">
                <FolderOpen className="w-6 h-6 text-white" />
              </div>
              <ArrowRight className="w-5 h-5 text-slate-400 group-hover:text-[#8b5cf6] group-hover:translate-x-1 transition-all" />
            </div>
            <h3 className="text-lg font-bold text-slate-800 mb-2">
              工作空间
            </h3>
            <p className="text-sm text-slate-500">
              管理和创建个人/企业工作空间
            </p>
          </button>
        </div>
      </div>
    </section>
  );
}
