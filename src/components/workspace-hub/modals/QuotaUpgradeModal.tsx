"use client";

import React, { useEffect, useState } from "react";
import { X, ArrowRight, Building2, Zap, Server, Boxes, Users } from "lucide-react";
import { useRouter } from "next/navigation";

/**
 * 场景锚定：从哪个入口唤起中枢，就高亮对应的权益维度。
 * - workspace: 企业空间数量（空间列表区「增加空间数量」入口）
 * - token:     每月算力 Token（资源卡片算力入口）
 * - api:       每月调用额度
 * - component: 可装配组件额度
 * - team:      团队协同人数
 */
export type UpgradeHighlight = "workspace" | "token" | "api" | "component" | "team" | null;

interface MembershipLevel {
  id: string;
  name: string;
  nameZh: string;
  icon: string | null;
  color: string;
  maxPersonalWorkspaces: number;
  maxEnterpriseWorkspaces: number;
  maxComponents: number;
  maxTeamSize: number;
  maxStorage: number;
  maxApiCalls: number;
  tokenLimit: number;
  priceMonthly: number;
  priceYearly: number;
  sortOrder: number;
  isPopular: boolean;
}

interface QuotaUpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** 当前会员等级名（FREE / BRONZE / SILVER / GOLD / DIAMOND / CROWN） */
  currentLevel: string;
  /** 已创建的企业空间数 */
  currentCount: number;
  /** 当前等级允许的企业空间上限 */
  maxLimit: number;
  highlight?: UpgradeHighlight;
}

const UNLIMITED = -1;

const formatQuota = (value: number): string =>
  value === UNLIMITED ? "无限" : value.toLocaleString("zh-CN");

const formatStorage = (bytes: number): string =>
  bytes === UNLIMITED ? "无限" : `${(bytes / 1024 ** 3).toFixed(0)} GB`;

/** 权益维度定义：数值全部来自数据库 membershiplevel 字段 */
const BENEFIT_ROWS: {
  key: Exclude<UpgradeHighlight, null>;
  label: string;
  icon: React.ReactNode;
  render: (level: MembershipLevel) => string;
}[] = [
  {
    key: "workspace",
    label: "企业空间数量",
    icon: <Building2 className="w-4 h-4" />,
    render: (l) => `${formatQuota(l.maxEnterpriseWorkspaces)} 个`,
  },
  {
    key: "token",
    label: "每月算力 Token",
    icon: <Zap className="w-4 h-4" />,
    render: (l) => `${formatQuota(l.tokenLimit)} /月`,
  },
  {
    key: "api",
    label: "每月调用额度",
    icon: <Server className="w-4 h-4" />,
    render: (l) => `${formatQuota(l.maxApiCalls)} /月`,
  },
  {
    key: "component",
    label: "可装配组件额度",
    icon: <Boxes className="w-4 h-4" />,
    render: (l) => `${formatQuota(l.maxComponents)} 个`,
  },
  {
    key: "team",
    label: "团队协同人数",
    icon: <Users className="w-4 h-4" />,
    render: (l) => `${formatQuota(l.maxTeamSize)} 人`,
  },
];

/** 按场景生成标题与提示语，避免不同入口使用同一套模糊文案 */
const getSceneCopy = (highlight: UpgradeHighlight) => {
  switch (highlight) {
    case "workspace":
      return {
        badge: "🚨 企业空间数量已达上限",
        title: "增加企业空间数量",
        desc: "企业空间数量由会员等级决定，升级后即可创建更多协作空间。",
      };
    case "token":
      return {
        badge: "⚡ 算力额度不足",
        title: "提升每月算力额度",
        desc: "每月算力 Token 由会员等级决定，升级后立即提升可用额度。",
      };
    case "api":
      return {
        badge: "📈 调用额度不足",
        title: "提升每月调用额度",
        desc: "组件调用额度由会员等级决定，升级后可获得更充裕的调用配额。",
      };
    case "component":
      return {
        badge: "🧩 组件额度已满",
        title: "提升组件装配额度",
        desc: "单个空间可装配的组件实例上限由会员等级决定。",
      };
    case "team":
      return {
        badge: "👥 团队席位已满",
        title: "扩充团队协同席位",
        desc: "可邀请的协同成员人数由会员等级决定。",
      };
    default:
      return {
        badge: "✨ 解锁更多企业级权益",
        title: "升级会员套餐",
        desc: "对比各等级权益，选择最适合您团队规模的订阅方案。",
      };
  }
};

export default function QuotaUpgradeModal({
  isOpen,
  onClose,
  currentLevel,
  currentCount,
  maxLimit,
  highlight = null,
}: QuotaUpgradeModalProps) {
  const router = useRouter();
  const [levels, setLevels] = useState<MembershipLevel[]>([]);
  const [loading, setLoading] = useState(false);
  // 用户在多档位中主动选择的升级目标；为空时默认取紧邻的下一档
  const [selectedTargetName, setSelectedTargetName] = useState<string | null>(null);

  // 打开时拉取会员等级真实数据（与定价页同源，杜绝硬编码）
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    // 每次打开重置为默认档位，避免沿用上次选择
    setSelectedTargetName(null);

    const loadLevels = async () => {
      try {
        setLoading(true);
        const res = await fetch("/api/membership/levels");
        const result = await res.json();
        if (!cancelled && result.success && Array.isArray(result.data)) {
          setLevels(result.data);
        }
      } catch (error) {
        console.error("加载会员等级失败:", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadLevels();
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const current = levels.find((l) => l.name === currentLevel) || null;
  const currentIndex = levels.findIndex((l) => l.name === currentLevel);

  // 所有高于当前等级的可升级档位（数据按 sortOrder 升序，故直接切片）
  const upgradeOptions = currentIndex >= 0 ? levels.slice(currentIndex + 1) : [];

  // 对比目标：优先用户选中的档位，否则默认紧邻的下一档
  const target =
    upgradeOptions.find((l) => l.name === selectedTargetName) || upgradeOptions[0] || null;

  const scene = getSceneCopy(highlight);
  const isTopLevel = currentIndex >= 0 && currentIndex === levels.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal Container */}
      <div className="relative bg-white/95 backdrop-blur-xl rounded-[24px] shadow-2xl border border-white max-w-2xl w-full max-h-[90vh] overflow-y-auto p-8 z-10 animate-scale-in">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-6 right-6 p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer z-20"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Title & Badge */}
        <div className="mb-6 flex-shrink-0">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-red-50 border border-red-200/50 rounded-full text-[11px] text-red-600 font-bold mb-3">
            {scene.badge}
          </span>
          <h3 className="text-xl md:text-2xl font-black text-slate-800 tracking-tight leading-tight">
            {scene.title}
          </h3>
          <p className="text-xs text-slate-500 mt-1.5 font-semibold leading-relaxed">
            {scene.desc}
          </p>
        </div>

        {/* Current State Indicator - 等级名与数量均取自数据库/实时配额 */}
        <div className="bg-[#f0f8ff] border border-blue-100/50 rounded-2xl p-4 mb-6 flex items-center justify-between shadow-inner flex-shrink-0">
          <div>
            <span className="text-[10px] text-slate-400 font-black block uppercase tracking-wider mb-0.5">
              企业空间使用情况
            </span>
            <span className="text-sm text-slate-700 font-black">
              已创建:{" "}
              <span className={currentCount >= maxLimit ? "text-red-500" : "text-[#2b6cb0]"}>
                {currentCount}
              </span>{" "}
              / {maxLimit === UNLIMITED ? "无限" : maxLimit} 个
            </span>
          </div>
          <span
            className="text-white text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-wider shadow-sm"
            style={{ backgroundColor: current?.color || "#94a3b8" }}
          >
            {current?.nameZh || "免费版"}
          </span>
        </div>

        {/* 权益对比表：当前等级 ➔ 升级目标，高亮触发场景对应的维度 */}
        {loading ? (
          <div className="py-10 text-center text-xs text-slate-400 font-bold">
            正在加载等级权益数据...
          </div>
        ) : target && current ? (
          <div className="mb-6">
            <h4 className="text-xs text-slate-700 font-bold mb-3">选择升级目标档位：</h4>

            {/* 档位选择器：列出所有高于当前等级的档位，支持跨档直达 */}
            <div className="flex gap-2 overflow-x-auto pb-2 mb-5">
              {upgradeOptions.map((opt) => {
                const isSelected = target.name === opt.name;
                return (
                  <button
                    key={opt.id}
                    onClick={() => setSelectedTargetName(opt.name)}
                    title={`对比升级到 ${opt.nameZh} 的权益`}
                    className={`shrink-0 px-3 py-2 rounded-xl border-2 transition-all cursor-pointer text-left ${isSelected
                      ? "border-[#3182ce] bg-blue-50/60 shadow-sm"
                      : "border-slate-200 hover:border-slate-300 bg-white"
                      }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="text-base leading-none">{opt.icon || "💎"}</span>
                      <span
                        className={`text-xs font-black ${isSelected ? "text-[#2b6cb0]" : "text-slate-700"}`}
                      >
                        {opt.nameZh}
                      </span>
                      {opt.isPopular && (
                        <span className="text-[9px] font-black text-[#2b6cb0] bg-blue-100/70 px-1 py-0.5 rounded">
                          推荐
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] font-bold text-slate-500 mt-1">
                      ¥{opt.priceMonthly / 100}/月
                    </div>
                  </button>
                );
              })}
            </div>

            <h4 className="text-xs text-slate-700 font-bold mb-3">
              升级到「{target.nameZh}」后的权益变化：
            </h4>

            <div className="rounded-2xl border border-slate-200/60 overflow-hidden">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-slate-50/80">
                    <th className="px-4 py-2.5 text-left text-[11px] font-black text-slate-500">
                      权益项
                    </th>
                    <th className="px-4 py-2.5 text-center text-[11px] font-black text-slate-500">
                      当前（{current.nameZh}）
                    </th>
                    <th className="px-4 py-2.5 text-center text-[11px] font-black text-[#2b6cb0] bg-blue-50/40">
                      升级后（{target.nameZh}）
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {BENEFIT_ROWS.map((row) => {
                    const isHighlighted = highlight === row.key;
                    return (
                      <tr
                        key={row.key}
                        className={`border-t border-slate-100 transition-colors ${isHighlighted ? "bg-amber-50/60" : "bg-white"
                          }`}
                      >
                        <td className="px-4 py-3 text-slate-700 text-xs font-bold">
                          <span className="inline-flex items-center gap-2">
                            <span className={isHighlighted ? "text-[#d97706]" : "text-slate-400"}>
                              {row.icon}
                            </span>
                            {row.label}
                            {isHighlighted && (
                              <span className="text-[9px] font-black text-[#d97706] bg-amber-100/70 px-1.5 py-0.5 rounded">
                                相关
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center text-xs font-bold text-slate-500">
                          {row.render(current)}
                        </td>
                        <td className="px-4 py-3 text-center text-xs font-black text-[#2b6cb0] bg-blue-50/25">
                          {row.render(target)}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="border-t border-slate-100 bg-white">
                    <td className="px-4 py-3 text-slate-700 text-xs font-bold">月度费用</td>
                    <td className="px-4 py-3 text-center text-xs font-bold text-slate-500">
                      ¥{current.priceMonthly / 100}/月
                    </td>
                    <td className="px-4 py-3 text-center text-xs font-black text-[#2b6cb0] bg-blue-50/25">
                      ¥{target.priceMonthly / 100}/月
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        ) : isTopLevel ? (
          <div className="mb-6 p-4 bg-emerald-50/60 border border-emerald-100 rounded-2xl">
            <p className="text-xs text-emerald-700 font-bold leading-relaxed">
              您已是最高等级（{current?.nameZh || "皇冠会员"}），企业空间数量与算力额度均为无限。如需进一步定制，请联系专属架构师。
            </p>
          </div>
        ) : (
          <div className="mb-6 p-4 bg-slate-50 border border-slate-200 rounded-2xl">
            <p className="text-xs text-slate-500 font-bold leading-relaxed">
              暂时无法加载等级权益对比数据，您可前往定价页查看完整的等级权益说明。
            </p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={onClose}
            className="sm:w-1/3 px-4.5 py-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs text-slate-500 font-black cursor-pointer transition-all text-center"
          >
            取消
          </button>
          <button
            onClick={() => {
              onClose();
              // 携带用户选定的目标档位，供定价页预选并高亮
              router.push(target ? `/pricing?target=${target.name}` : "/pricing");
            }}
            className="flex-1 bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] hover:brightness-105 border-t border-[#63b3ed] text-white text-xs font-black px-6 py-2.5 rounded-lg shadow-md cursor-pointer transition-all flex items-center justify-center gap-1"
          >
            <span>{target ? `升级到${target.nameZh}` : "查看套餐并升级"}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
