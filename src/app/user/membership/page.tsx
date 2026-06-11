﻿"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  CreditCard,
  Star,
  Zap,
  CheckCircle,
  Crown,
  Gem,
  Award,
  TrendingUp,
  Box,
} from "lucide-react";

interface MembershipInfo {
  name: string;
  nameZh: string;
  icon: string | null;
  color: string;
  description: string | null;
  maxPersonalWorkspaces: number;
  maxEnterpriseWorkspaces: number;
  maxComponents: number;
  maxApiCalls: number;
  maxStorage: number;
  priceMonthly: number;
  priceYearly: number;
}

export default function UserMembershipPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [membershipInfo, setMembershipInfo] = useState<MembershipInfo | null>(null);
  const [userLevel, setUserLevel] = useState<string>("");
  const [stats, setStats] = useState({
    workspaceCount: 0,
    componentCount: 0,
    apiCallsUsed: 0,
    storageUsed: 0,
  });

  useEffect(() => {
    loadMembershipData();
  }, []);

  const loadMembershipData = async () => {
    try {
      const userId =
        typeof window !== "undefined" ? localStorage.getItem("userId") : "";

      const [userRes, levelsRes] = await Promise.all([
        fetch("/api/user/profile", {
          headers: { Authorization: `Bearer ${userId}` },
        }),
        fetch("/api/admin/membership/levels", {
          headers: { Authorization: `Bearer ${userId}` },
        }),
      ]);

      if (userRes.ok && levelsRes.ok) {
        const userData = await userRes.json();
        const levelsData = await levelsRes.json();

        setUserLevel(userData.data.membershipLevel || "FREE");

        const currentLevel = levelsData.data.find(
          (level: any) => level.name === userData.data.membershipLevel
        );

        if (currentLevel) {
          setMembershipInfo(currentLevel);
        }

        // 加载使用统计
        const statsRes = await fetch("/api/user/dashboard/stats", {
          headers: { Authorization: `Bearer ${userId}` },
        });

        if (statsRes.ok) {
          const statsData = await statsRes.json();
          setStats({
            workspaceCount: statsData.data.workspaceCount,
            componentCount: statsData.data.componentCount,
            apiCallsUsed: statsData.data.apiCallsUsed,
            storageUsed: statsData.data.storageUsed,
          });
        }
      }
    } catch (error) {
      console.error("Load membership data error:", error);
    } finally {
      setLoading(false);
    }
  };

  const getLevelIcon = (name: string) => {
    switch (name) {
      case "CROWN":
        return Crown;
      case "DIAMOND":
        return Gem;
      case "GOLD":
        return Award;
      case "SILVER":
      case "BRONZE":
        return Star;
      default:
        return Zap;
    }
  };

  const formatBytes = (bytes: number) => {
    const gb = bytes / 1073741824;
    return `${gb.toFixed(1)} GB`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-[#3182ce]/30 border-t-[#3182ce] rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600 font-medium">加载数据中...</p>
        </div>
      </div>
    );
  }

  const LevelIcon = membershipInfo ? getLevelIcon(membershipInfo.name) : Zap;

  // 计算配额使用百分比
  const workspaceUsage = membershipInfo?.maxPersonalWorkspaces 
    ? Math.round((stats.workspaceCount / membershipInfo.maxPersonalWorkspaces) * 100)
    : 0;
  const componentUsage = membershipInfo?.maxComponents
    ? Math.round((stats.componentCount / Number(membershipInfo.maxComponents)) * 100)
    : 0;
  const apiUsage = membershipInfo?.maxApiCalls
    ? Math.round((stats.apiCallsUsed / Number(membershipInfo.maxApiCalls)) * 100)
    : 0;
  const storageUsage = membershipInfo?.maxStorage
    ? Math.round((stats.storageUsed / Number(membershipInfo.maxStorage)) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="shrink-0">
        <h1 className="text-3xl font-black text-slate-800 mb-2 tracking-tight truncate">
          会员信息
        </h1>
        <p className="text-sm text-slate-500 font-medium truncate">
          会员等级、配额使用、权益详情
        </p>
      </div>

      {/* 当前会员等级卡片 */}
      <div className="relative bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] rounded-2xl shadow-lg p-8 overflow-hidden shrink-0">
        <div className="absolute -right-4 -top-4 w-64 h-64 rounded-full bg-white/10 blur-3xl"></div>
        <div className="relative">
          <div className="flex items-center justify-between mb-6">
            <div>
              <p className="text-blue-100 mb-2">当前会员等级</p>
              <h2 className="text-3xl font-black text-white mb-2">
                {membershipInfo?.nameZh || "免费版"}
              </h2>
              <p className="text-blue-100">
                {membershipInfo?.description || "基础功能免费使用"}
              </p>
            </div>
            <div className="w-24 h-24 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <LevelIcon className="w-12 h-12 text-white" />
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-6 border-t border-white/20">
            <div>
              <p className="text-blue-100 text-xs mb-1">工作空间</p>
              <p className="text-2xl font-black text-white">
                {stats.workspaceCount} / {membershipInfo?.maxPersonalWorkspaces || 1}
              </p>
            </div>
            <div>
              <p className="text-blue-100 text-xs mb-1">组件数量</p>
              <p className="text-2xl font-black text-white">
                {stats.componentCount} / {Number(membershipInfo?.maxComponents) || 100}
              </p>
            </div>
            <div>
              <p className="text-blue-100 text-xs mb-1">API 调用</p>
              <p className="text-2xl font-black text-white">
                {stats.apiCallsUsed} / {Number(membershipInfo?.maxApiCalls) || 1000}
              </p>
            </div>
            <div>
              <p className="text-blue-100 text-xs mb-1">存储空间</p>
              <p className="text-2xl font-black text-white">
                {formatBytes(stats.storageUsed)} / {formatBytes(Number(membershipInfo?.maxStorage) || 1073741824)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 配额使用进度 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 shrink-0">
        <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-white/90 shadow-sm overflow-hidden">
          <div className="absolute -right-4 -top-4 w-32 h-32 rounded-full bg-gradient-to-br from-[#3182ce]/10 to-[#2563eb]/10 opacity-50 blur-3xl"></div>
          <div className="relative">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-[#3182ce]/10 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-[#3182ce]" />
              </div>
              <h3 className="text-lg font-black text-slate-800">工作空间配额</h3>
            </div>
            <div className="mb-2">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-slate-500 font-medium">个人空间</span>
                <span className="text-sm font-bold text-slate-700">{stats.workspaceCount} / {membershipInfo?.maxPersonalWorkspaces || 1}</span>
              </div>
              <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                <div 
                  className={`h-full rounded-full transition-all duration-500 ${workspaceUsage > 90 ? 'bg-red-500' : workspaceUsage > 70 ? 'bg-[#f59e0b]' : 'bg-[#3182ce]'}`}
                  style={{ width: `${workspaceUsage}%` }}
                ></div>
              </div>
              <p className="text-xs text-slate-400 mt-1">已使用 {workspaceUsage}%</p>
            </div>
            <div className="mt-4 pt-4 border-t border-slate-200">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">企业空间</span>
                <span className="font-bold text-slate-700">{membershipInfo?.maxEnterpriseWorkspaces || 0} 个</span>
              </div>
            </div>
          </div>
        </div>

        <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-white/90 shadow-sm overflow-hidden">
          <div className="absolute -right-4 -top-4 w-32 h-32 rounded-full bg-gradient-to-br from-[#10b981]/10 to-[#059669]/10 opacity-50 blur-3xl"></div>
          <div className="relative">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-[#10b981]/10 flex items-center justify-center">
                <Box className="w-5 h-5 text-[#10b981]" />
              </div>
              <h3 className="text-lg font-black text-slate-800">组件配额</h3>
            </div>
            <div className="mb-2">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-slate-500 font-medium">已创建组件</span>
                <span className="text-sm font-bold text-slate-700">{stats.componentCount} / {Number(membershipInfo?.maxComponents) || 100}</span>
              </div>
              <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                <div 
                  className={`h-full rounded-full transition-all duration-500 ${componentUsage > 90 ? 'bg-red-500' : componentUsage > 70 ? 'bg-[#f59e0b]' : 'bg-[#10b981]'}`}
                  style={{ width: `${componentUsage}%` }}
                ></div>
              </div>
              <p className="text-xs text-slate-400 mt-1">已使用 {componentUsage}%</p>
            </div>
          </div>
        </div>

        <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-white/90 shadow-sm overflow-hidden">
          <div className="absolute -right-4 -top-4 w-32 h-32 rounded-full bg-gradient-to-br from-[#f59e0b]/10 to-[#d97706]/10 opacity-50 blur-3xl"></div>
          <div className="relative">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-[#f59e0b]/10 flex items-center justify-center">
                <Zap className="w-5 h-5 text-[#f59e0b]" />
              </div>
              <h3 className="text-lg font-black text-slate-800">API 调用配额</h3>
            </div>
            <div className="mb-2">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-slate-500 font-medium">本月调用</span>
                <span className="text-sm font-bold text-slate-700">{stats.apiCallsUsed} / {Number(membershipInfo?.maxApiCalls) || 1000}</span>
              </div>
              <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                <div 
                  className={`h-full rounded-full transition-all duration-500 ${apiUsage > 90 ? 'bg-red-500' : apiUsage > 70 ? 'bg-[#f59e0b]' : 'bg-[#f59e0b]'}`}
                  style={{ width: `${apiUsage}%` }}
                ></div>
              </div>
              <p className="text-xs text-slate-400 mt-1">已使用 {apiUsage}%</p>
            </div>
          </div>
        </div>

        <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-white/90 shadow-sm overflow-hidden">
          <div className="absolute -right-4 -top-4 w-32 h-32 rounded-full bg-gradient-to-br from-[#8b5cf6]/10 to-[#7c3aed]/10 opacity-50 blur-3xl"></div>
          <div className="relative">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-[#8b5cf6]/10 flex items-center justify-center">
                <CreditCard className="w-5 h-5 text-[#8b5cf6]" />
              </div>
              <h3 className="text-lg font-black text-slate-800">存储空间</h3>
            </div>
            <div className="mb-2">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-slate-500 font-medium">已用存储</span>
                <span className="text-sm font-bold text-slate-700">{formatBytes(stats.storageUsed)} / {formatBytes(Number(membershipInfo?.maxStorage) || 1073741824)}</span>
              </div>
              <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                <div 
                  className={`h-full rounded-full transition-all duration-500 ${storageUsage > 90 ? 'bg-red-500' : storageUsage > 70 ? 'bg-[#f59e0b]' : 'bg-[#8b5cf6]'}`}
                  style={{ width: `${storageUsage}%` }}
                ></div>
              </div>
              <p className="text-xs text-slate-400 mt-1">已使用 {storageUsage}%</p>
            </div>
          </div>
        </div>
      </div>

      {/* 升级提示 */}
      {!membershipInfo || membershipInfo.name === "FREE" ? (
        <div className="relative bg-gradient-to-br from-[#f59e0b]/5 to-[#d97706]/5 rounded-2xl border border-[#f59e0b]/20 p-8 text-center overflow-hidden shrink-0">
          <div className="absolute -right-4 -top-4 w-64 h-64 rounded-full bg-[#f59e0b]/10 opacity-30 blur-3xl"></div>
          <div className="relative">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#f59e0b] to-[#d97706] flex items-center justify-center mx-auto mb-4 shadow-lg">
              <Crown className="w-10 h-10 text-white" />
            </div>
            <h3 className="text-xl font-black text-slate-800 mb-2">
              升级会员，解锁更多权益
            </h3>
            <p className="text-slate-600 mb-6">
              升级会员可享受更多工作空间、更高配额和专属功能
            </p>
            <div className="flex items-center justify-center gap-4">
              <button 
                onClick={() => router.push("/workspace-hub")}
                className="px-8 py-3 bg-gradient-to-r from-[#f59e0b] to-[#d97706] text-white rounded-xl font-semibold hover:shadow-lg hover:shadow-[#f59e0b]/30 hover:-translate-y-0.5 transition-all duration-300"
              >
                升级会员
              </button>
              <button 
                onClick={() => router.push("/admin/membership/levels")}
                className="px-8 py-3 bg-white border-2 border-[#f59e0b] text-[#f59e0b] rounded-xl font-semibold hover:bg-[#f59e0b]/5 transition-all duration-300"
              >
                查看会员套餐
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="relative bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl border border-green-200 p-8 text-center overflow-hidden shrink-0">
          <div className="absolute -right-4 -top-4 w-64 h-64 rounded-full bg-green-100 opacity-50 blur-3xl"></div>
          <div className="relative">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#10b981] to-[#059669] flex items-center justify-center mx-auto mb-4 shadow-lg">
              <CheckCircle className="w-10 h-10 text-white" />
            </div>
            <h3 className="text-xl font-black text-slate-800 mb-2">
              您已是{membershipInfo.nameZh}会员
            </h3>
            <p className="text-slate-600 mb-6">
              享受所有会员权益，如有任何问题请联系客服
            </p>
            <button 
              onClick={() => router.push("/admin/membership/levels")}
              className="px-8 py-3 bg-white border-2 border-[#10b981] text-[#10b981] rounded-xl font-semibold hover:bg-green-50 transition-all duration-300"
            >
              查看会员套餐
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
