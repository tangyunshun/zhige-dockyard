"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Cpu,
  HardDrive,
  Zap,
  TrendingUp,
  Plus,
  ArrowLeft,
  CreditCard,
  Gift,
} from "lucide-react";

export default function AssetsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [assets, setAssets] = useState({
    computePoints: 1000,
    storage: 50,
    bandwidth: 1000,
    monthlyUsage: {
      compute: 234,
      storage: 12.5,
      bandwidth: 456,
    },
  });

  useEffect(() => {
    loadAssets();
  }, []);

  const loadAssets = async () => {
    try {
      // TODO: 调用 API 获取真实数据
      // 模拟数据
      setAssets({
        computePoints: 1000,
        storage: 50,
        bandwidth: 1000,
        monthlyUsage: {
          compute: 234,
          storage: 12.5,
          bandwidth: 456,
        },
      });
    } catch (error) {
      console.error("Load assets error:", error);
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    {
      icon: Cpu,
      label: "算力点数",
      value: assets.computePoints.toLocaleString(),
      unit: "点",
      usage: assets.monthlyUsage.compute,
      color: "from-[#3182ce] to-[#2563eb]",
      bgColor: "bg-[#3182ce]/10",
    },
    {
      icon: HardDrive,
      label: "存储空间",
      value: assets.storage,
      unit: "GB",
      usage: assets.monthlyUsage.storage,
      color: "from-[#10b981] to-[#059669]",
      bgColor: "bg-[#10b981]/10",
    },
    {
      icon: Zap,
      label: "流量额度",
      value: assets.bandwidth,
      unit: "GB",
      usage: assets.monthlyUsage.bandwidth,
      color: "from-[#f59e0b] to-[#d97706]",
      bgColor: "bg-[#f59e0b]/10",
    },
  ];

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      {/* 顶部导航 */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-slate-600 hover:text-[#3182ce] transition-colors cursor-pointer"
          >
            <div className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center transition-all">
              <ArrowLeft className="w-5 h-5" />
            </div>
            <span className="text-sm font-medium">返回</span>
          </button>
          <div className="h-6 w-px bg-slate-200"></div>
          <h1 className="text-lg font-bold text-slate-800">个人算力资产</h1>
        </div>
      </header>

      {/* 主要内容 */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* 说明卡片 */}
        <div className="bg-gradient-to-br from-[#3182ce] to-[#2563eb] rounded-2xl p-8 mb-8 text-white shadow-xl">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-2xl font-bold mb-3">算力资产管理</h2>
              <p className="text-blue-100 text-sm leading-relaxed max-w-2xl">
                您的算力资产包括计算点数、存储空间和流量额度。这些资源可用于运行组件、存储数据和网络传输。
                每月 1 日自动重置使用量，未使用的额度不会结转至下月。
              </p>
            </div>
            <div className="w-20 h-20 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center flex-shrink-0">
              <Cpu className="w-10 h-10 text-white" />
            </div>
          </div>
        </div>

        {/* 资产统计卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {statCards.map((card, index) => {
            const Icon = card.icon;
            const usagePercent = (card.usage / card.value) * 100;

            return (
              <div
                key={index}
                className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm hover:shadow-lg transition-all"
              >
                <div className="flex items-center justify-between mb-4">
                  <div
                    className={`w-12 h-12 rounded-lg ${card.bgColor} flex items-center justify-center`}
                  >
                    <Icon className={`w-6 h-6 ${card.color}`} />
                  </div>
                  <button className="text-sm text-[#3182ce] font-medium hover:text-[#2563eb] transition-colors flex items-center gap-1">
                    <Plus className="w-4 h-4" />
                    充值
                  </button>
                </div>

                <div className="text-2xl font-bold text-slate-800 mb-1">
                  {card.value} {card.unit}
                </div>
                <div className="text-sm text-slate-500 font-medium mb-4">
                  {card.label}
                </div>

                {/* 使用进度条 */}
                <div className="mb-2">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-slate-500">本月已用</span>
                    <span className="text-slate-700 font-bold">
                      {card.usage} {card.unit}
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full bg-gradient-to-r ${card.color} rounded-full transition-all duration-500`}
                      style={{ width: `${usagePercent}%` }}
                    />
                  </div>
                </div>

                <div className="text-xs text-slate-400 mt-2">
                  剩余 {parseFloat((card.value - card.usage).toFixed(1))} {card.unit}
                </div>
              </div>
            );
          })}
        </div>

        {/* 快捷操作 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-[#10b981]/10 flex items-center justify-center">
                <CreditCard className="w-5 h-5 text-[#10b981]" />
              </div>
              <h3 className="text-lg font-bold text-slate-800">套餐订阅</h3>
            </div>
            <p className="text-sm text-slate-500 mb-4">
              订阅月度套餐，享受更多资源和优惠价格
            </p>
            <button className="w-full py-3 bg-gradient-to-r from-[#10b981] to-[#059669] text-white font-bold rounded-lg hover:shadow-lg transition-all cursor-pointer">
              查看套餐
            </button>
          </div>

          <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-[#f59e0b]/10 flex items-center justify-center">
                <Gift className="w-5 h-5 text-[#f59e0b]" />
              </div>
              <h3 className="text-lg font-bold text-slate-800">兑换码</h3>
            </div>
            <p className="text-sm text-slate-500 mb-4">
              输入兑换码获取免费算力资源
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="请输入兑换码"
                className="flex-1 px-4 py-2 border border-slate-200 rounded-lg focus:border-[#3182ce] outline-none text-sm"
              />
              <button className="px-6 py-2 bg-[#3182ce] text-white font-bold rounded-lg hover:bg-[#2563eb] transition-colors cursor-pointer">
                兑换
              </button>
            </div>
          </div>
        </div>

        {/* 使用记录 */}
        <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-slate-800">使用记录</h3>
            <button className="text-sm text-[#3182ce] font-medium hover:text-[#2563eb] transition-colors">
              查看全部
            </button>
          </div>

          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((_, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center">
                    <Cpu className="w-5 h-5 text-slate-600" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-slate-800">
                      组件运行消耗
                    </div>
                    <div className="text-xs text-slate-400">
                      2024-01-{15 - index} 14:30
                    </div>
                  </div>
                </div>
                <div className="text-sm font-bold text-red-500">
                  -{Math.floor(Math.random() * 50) + 10} 点
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
