"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Crown,
  FileText,
  Users,
  History,
  ArrowLeft,
  TrendingUp,
  DollarSign,
  Award,
} from "lucide-react";

interface MembershipStats {
  totalMembers: number;
  totalOrders: number;
  activeLevels: number;
  revenue: number;
}

export default function AdminMembershipIndex() {
  const router = useRouter();
  const [stats, setStats] = useState<MembershipStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      setLoading(true);
      const userId =
        typeof window !== "undefined" ? localStorage.getItem("userId") : "";

      if (!userId) {
        console.error("User ID not found");
        return;
      }

      console.log("Loading stats with userId:", userId);

      const [levelsRes, ordersRes, usersRes] = await Promise.all([
        fetch("/api/admin/membership/levels", {
          headers: {
            Authorization: `Bearer ${userId}`,
          },
        }),
        fetch("/api/admin/membership/orders?page=1&limit=1", {
          headers: {
            Authorization: `Bearer ${userId}`,
          },
        }),
        fetch("/api/admin/membership/users?page=1&limit=1", {
          headers: {
            Authorization: `Bearer ${userId}`,
          },
        }),
      ]);

      console.log("API responses:", {
        levels: { status: levelsRes.status, ok: levelsRes.ok },
        orders: { status: ordersRes.status, ok: ordersRes.ok },
        users: { status: usersRes.status, ok: usersRes.ok },
      });

      // 分别处理每个响应
      let levelsData = null;
      let ordersData = null;
      let usersData = null;

      if (levelsRes.ok) {
        levelsData = await levelsRes.json();
        console.log("Levels data:", levelsData);
      } else {
        const errorText = await levelsRes.text();
        console.error("Failed to load levels:", levelsRes.status, errorText);
      }

      if (ordersRes.ok) {
        ordersData = await ordersRes.json();
        console.log("Orders data:", ordersData);
      } else {
        const errorText = await ordersRes.text();
        console.error("Failed to load orders:", ordersRes.status, errorText);
      }

      if (usersRes.ok) {
        usersData = await usersRes.json();
        console.log("Users data:", usersData);
      } else {
        const errorText = await usersRes.text();
        console.error("Failed to load users:", usersRes.status, errorText);
      }

      // 只要有部分成功，就显示数据
      setStats({
        totalMembers: usersData?.data?.total || 0,
        totalOrders: ordersData?.data?.total || 0,
        activeLevels: levelsData?.data?.length || 0,
        revenue: 0, // TODO: 从订单统计
      });
    } catch (error) {
      console.error("Load stats error:", error);
    } finally {
      setLoading(false);
    }
  };

  const menuItems = [
    {
      icon: Crown,
      title: "会员等级管理",
      description: "配置会员等级、配额和权益",
      href: "/admin/membership/levels",
      color: "#3182ce",
      bgColor: "from-blue-500 to-blue-600",
    },
    {
      icon: FileText,
      title: "会员订单管理",
      description: "查看订单记录、手动开通会员",
      href: "/admin/membership/orders",
      color: "#10b981",
      bgColor: "from-green-500 to-green-600",
    },
    {
      icon: Users,
      title: "会员用户管理",
      description: "查看会员用户列表和状态",
      href: "/admin/membership/users",
      color: "#f59e0b",
      bgColor: "from-orange-500 to-orange-600",
    },
    {
      icon: History,
      title: "会员变更日志",
      description: "追踪会员等级变更历史",
      href: "/admin/membership/logs",
      color: "#8b5cf6",
      bgColor: "from-purple-500 to-purple-600",
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f0f8ff] via-[#e6f4f1] to-[#f5f3ff] pb-8">
      {/* 顶部导航 */}
      <div className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => router.back()}
              className="flex items-center gap-2 text-slate-600 hover:text-[#3182ce] transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              <span className="font-medium">返回</span>
            </button>
            <h1 className="text-2xl font-black text-slate-800 tracking-tight">
              会员管理
            </h1>
            <div className="w-20" />
          </div>
        </div>
      </div>

      {/* 主内容区 */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* 统计卡片 */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="relative bg-white/80 backdrop-blur-xl rounded-2xl border border-white/90 p-6 shadow-sm overflow-hidden"
              >
                <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-slate-100 opacity-50 blur-2xl"></div>
                <div className="h-8 w-8 bg-slate-200 rounded-lg mb-4 animate-pulse relative" />
                <div className="h-4 w-20 bg-slate-200 rounded mb-2 animate-pulse relative" />
                <div className="h-8 w-16 bg-slate-200 rounded animate-pulse relative" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl border border-white/90 p-6 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden">
              <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-[#3182ce]/10 opacity-20 blur-2xl"></div>
              <div className="relative">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-sm">
                    <Crown className="w-6 h-6 text-white" />
                  </div>
                  <TrendingUp className="w-5 h-5 text-[#3182ce]" />
                </div>
                <div className="text-sm text-slate-500 font-semibold mb-1">
                  会员总数
                </div>
                <div className="text-3xl font-black text-slate-800 tracking-tight">
                  {stats?.totalMembers || 0}
                </div>
              </div>
            </div>

            <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl border border-white/90 p-6 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden">
              <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-[#10b981]/10 opacity-20 blur-2xl"></div>
              <div className="relative">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center shadow-sm">
                    <FileText className="w-6 h-6 text-white" />
                  </div>
                  <TrendingUp className="w-5 h-5 text-green-600" />
                </div>
                <div className="text-sm text-slate-600 mb-1">订单总数</div>
                <div className="text-2xl font-black text-slate-800">
                  {stats?.totalOrders || 0}
                </div>
              </div>
            </div>

            <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl border border-white/90 p-6 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden">
              <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-[#f59e0b]/10 opacity-20 blur-2xl"></div>
              <div className="relative">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center shadow-sm">
                    <Award className="w-6 h-6 text-white" />
                  </div>
                  <TrendingUp className="w-5 h-5 text-orange-600" />
                </div>
                <div className="text-sm text-slate-600 mb-1">活跃等级</div>
                <div className="text-2xl font-black text-slate-800">
                  {stats?.activeLevels || 0}
                </div>
              </div>
            </div>

            <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl border border-white/90 p-6 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden">
              <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-[#8b5cf6]/10 opacity-20 blur-2xl"></div>
              <div className="relative">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center shadow-sm">
                    <DollarSign className="w-6 h-6 text-white" />
                  </div>
                  <TrendingUp className="w-5 h-5 text-purple-600" />
                </div>
                <div className="text-sm text-slate-600 mb-1">总收入</div>
                <div className="text-2xl font-black text-slate-800">
                  ¥{stats?.revenue?.toLocaleString() || 0}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 功能入口 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {menuItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.href}
                onClick={() => router.push(item.href)}
                className="group bg-white rounded-xl border-2 border-slate-200 p-6 text-left transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:border-[#3182ce]/30"
              >
                <div
                  className={`w-14 h-14 rounded-xl bg-gradient-to-br ${item.bgColor} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300 shadow-lg`}
                >
                  <Icon className="w-7 h-7 text-white" />
                </div>
                <h3 className="text-lg font-black text-slate-800 mb-2 group-hover:text-[#3182ce] transition-colors">
                  {item.title}
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  {item.description}
                </p>
                <div className="mt-4 flex items-center gap-2 text-[#3182ce] font-bold text-sm opacity-0 group-hover:opacity-100 transition-opacity">
                  <span>进入管理</span>
                  <svg
                    className="w-4 h-4 transform group-hover:translate-x-1 transition-transform"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </div>
              </button>
            );
          })}
        </div>

        {/* 快速说明 */}
        <div className="mt-8 bg-gradient-to-br from-[#3182ce]/5 to-[#2563eb]/5 rounded-xl border border-[#3182ce]/20 p-6">
          <h3 className="text-lg font-black text-slate-800 mb-3 flex items-center gap-2">
            <Crown className="w-5 h-5 text-[#3182ce]" />
            会员管理系统说明
          </h3>
          <div className="space-y-2 text-sm text-slate-700">
            <p>
              <strong className="text-[#3182ce]">会员等级管理：</strong>
              配置不同会员等级的配额限制（空间数量、组件数量、团队规模、存储空间等）和价格。
            </p>
            <p>
              <strong className="text-[#3182ce]">会员订单管理：</strong>
              查看用户购买记录，支持管理员手动为用户开通会员。
            </p>
            <p>
              <strong className="text-[#3182ce]">会员用户管理：</strong>
              查看所有用户的会员状态，按等级筛选用户。
            </p>
            <p>
              <strong className="text-[#3182ce]">会员变更日志：</strong>
              追踪所有会员等级变更操作，包括操作者和变更原因。
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
