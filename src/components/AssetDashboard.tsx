"use client";

import React, { useState, useEffect } from "react";
import { 
  FolderOpen, 
  FileText, 
  Image, 
  Zap, 
  HardDrive, 
  TrendingUp,
  Database,
  Server
} from "lucide-react";

interface AssetStats {
  totalProjects: number;
  totalDocuments: number;
  totalDiagrams: number;
  tokenBalance: number;
  storageUsed: number;
  storageTotal: number;
}

interface AssetDashboardProps {
  userId?: string;
}

export default function AssetDashboard({ userId }: AssetDashboardProps) {
  const [stats, setStats] = useState<AssetStats>({
    totalProjects: 0,
    totalDocuments: 0,
    totalDiagrams: 0,
    tokenBalance: 0,
    storageUsed: 0,
    storageTotal: 1024, // 默认 1GB
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAssetStats();
  }, [userId]);

  const loadAssetStats = async () => {
    if (!userId) return;
    
    try {
      const res = await fetch(`/api/workspace/assets?userId=${userId}`);
      if (res.ok) {
        const data = await res.json();
        setStats(data.stats || data);
      }
    } catch (error) {
      console.error("Load asset stats error:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-slate-200 rounded w-1/3"></div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="h-20 bg-slate-100 rounded-xl"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const storagePercent = Math.round((stats.storageUsed / stats.storageTotal) * 100);

  const statCards = [
    {
      title: "项目总数",
      value: stats.totalProjects,
      icon: FolderOpen,
      color: "#3182ce",
      bgColor: "from-[#3182ce]/10 to-[#2b6cb0]/10",
      description: "名下所有空间汇总",
    },
    {
      title: "已解析文档",
      value: stats.totalDocuments,
      icon: FileText,
      color: "#10b981",
      bgColor: "from-[#10b981]/10 to-[#059669]/10",
      description: "支持 markdown、pdf、word",
    },
    {
      title: "已生成架构图",
      value: stats.totalDiagrams,
      icon: Image,
      color: "#8b5cf6",
      bgColor: "from-[#8b5cf6]/10 to-[#7c3aed]/10",
      description: "系统架构、流程图、ER 图",
    },
    {
      title: "Token 余额",
      value: stats.tokenBalance,
      icon: Zap,
      color: "#f59e0b",
      bgColor: "from-[#f59e0b]/10 to-[#d97706]/10",
      description: `${stats.tokenBalance >= 10000 ? '充足' : '不足'}`,
    },
    {
      title: "云端存储",
      value: `${storagePercent}%`,
      icon: HardDrive,
      color: "#ef4444",
      bgColor: "from-[#ef4444]/10 to-[#dc2626]/10",
      description: `${(stats.storageUsed / 1024).toFixed(2)}GB / ${(stats.storageTotal / 1024).toFixed(2)}GB`,
      progress: storagePercent,
    },
    {
      title: "组件调用",
      value: "1,234",
      icon: TrendingUp,
      color: "#06b6d4",
      bgColor: "from-[#06b6d4]/10 to-[#0891b2]/10",
      description: "本月累计调用次数",
    },
  ];

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6">
      {/* 头部 */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center shadow-xl">
          <Database className="w-6 h-6 text-white" />
        </div>
        <div>
          <h2 className="text-xl font-black text-slate-800">
            数字资产看板
          </h2>
          <p className="text-sm text-slate-600">
            名下所有空间的资产概览与资源使用情况
          </p>
        </div>
      </div>

      {/* 资产卡片网格 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        {statCards.map((card, index) => {
          const Icon = card.icon;
          
          return (
            <div
              key={index}
              className="group relative overflow-hidden bg-gradient-to-br from-white to-slate-50 rounded-xl p-4 border border-slate-200 hover:border-slate-300 hover:shadow-lg transition-all duration-300 hover:-translate-y-1"
            >
              {/* 图标 */}
              <div 
                className="w-10 h-10 rounded-lg mb-3 flex items-center justify-center"
                style={{
                  background: `linear-gradient(135deg, ${card.bgColor})`,
                }}
              >
                <Icon className="w-5 h-5" style={{ color: card.color }} />
              </div>

              {/* 数值 */}
              <div className="text-2xl font-black text-slate-800 mb-1">
                {card.value}
              </div>

              {/* 标题 */}
              <div className="text-xs font-bold text-slate-700 mb-1">
                {card.title}
              </div>

              {/* 描述 */}
              <div className="text-[10px] text-slate-500 leading-relaxed">
                {card.description}
              </div>

              {/* 进度条（如果有） */}
              {card.progress !== undefined && (
                <div className="mt-2 w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#ef4444] to-[#dc2626] transition-all duration-500"
                    style={{ width: `${card.progress}%` }}
                  />
                </div>
              )}

              {/* Hover 效果 */}
              <div className="absolute inset-0 bg-gradient-to-br from-[#3182ce]/5 to-[#2b6cb0]/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"></div>
            </div>
          );
        })}
      </div>

      {/* 资源详情 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
        <div className="flex items-center gap-3">
          <Server className="w-8 h-8 text-[#3182ce]" />
          <div className="flex-1">
            <div className="text-xs text-slate-600 mb-1">数据库连接数</div>
            <div className="text-lg font-bold text-slate-800">12 / 100</div>
          </div>
          <div className="w-24 h-1.5 bg-slate-200 rounded-full overflow-hidden">
            <div className="h-full bg-[#3182ce]" style={{ width: '12%' }} />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Database className="w-8 h-8 text-[#10b981]" />
          <div className="flex-1">
            <div className="text-xs text-slate-600 mb-1">API 调用配额</div>
            <div className="text-lg font-bold text-slate-800">8,432 / 10,000</div>
          </div>
          <div className="w-24 h-1.5 bg-slate-200 rounded-full overflow-hidden">
            <div className="h-full bg-[#10b981]" style={{ width: '84%' }} />
          </div>
        </div>
      </div>
    </div>
  );
}
