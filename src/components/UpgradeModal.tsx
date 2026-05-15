"use client";

import React, { useState } from "react";
import { X, ArrowRight, Shield, Layers, Trash2 } from "lucide-react";

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (mode: "migrate" | "parallel" | "replace") => void;
  workspaceName?: string;
}

export default function UpgradeModal({
  isOpen,
  onClose,
  onConfirm,
  workspaceName,
}: UpgradeModalProps) {
  const [selectedMode, setSelectedMode] = useState<
    "migrate" | "parallel" | "replace" | null
  >(null);

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (selectedMode) {
      onConfirm(selectedMode);
    }
  };

  const upgradeModes = [
    {
      id: "migrate" as const,
      icon: Layers,
      title: "平移升级",
      description: "将个人空间数据全量迁移至企业空间，原个人空间消失",
      features: [
        "✓ 所有组件数据完整保留",
        "✓ 项目文档自动迁移",
        "✓ AI 引擎配置继承",
        "✓ 个人空间将被移除",
      ],
      color: "#3182ce",
      bgColor: "from-[#3182ce]/10 to-[#2b6cb0]/10",
      borderColor: "#3182ce/30",
    },
    {
      id: "parallel" as const,
      icon: Shield,
      title: "并行创建",
      description: "保留个人空间，新建一个独立的企业空间",
      features: [
        "✓ 个人空间继续保留",
        "✓ 创建全新企业环境",
        "✓ 双空间独立运行",
        "✓ 消耗 1 个企业槽位",
      ],
      color: "#10b981",
      bgColor: "from-[#10b981]/10 to-[#059669]/10",
      borderColor: "#10b981/30",
    },
    {
      id: "replace" as const,
      icon: Trash2,
      title: "替换升级",
      description: "删除个人空间，初始化一个全新的企业空间",
      features: [
        "✓ 删除所有个人数据",
        "✓ 初始化纯净企业环境",
        "✓ 重新开始协作",
        "⚠ 数据不可恢复",
      ],
      color: "#f59e0b",
      bgColor: "from-[#f59e0b]/10 to-[#d97706]/10",
      borderColor: "#f59e0b/30",
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* 遮罩层 */}
      <div
        className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* 弹窗主体 */}
      <div className="relative w-full max-w-5xl bg-white rounded-2xl shadow-2xl overflow-hidden">
        {/* 头部 */}
        <div className="flex items-center justify-between px-8 py-6 border-b border-slate-100">
          <div>
            <h2 className="text-xl font-bold text-slate-800">
              升级企业空间
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              选择升级方式，{workspaceName || "个人空间"} 将转换为企业级协作环境
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* 内容区域 */}
        <div className="p-8">
          <div className="grid grid-cols-3 gap-6">
            {upgradeModes.map((mode) => {
              const Icon = mode.icon;
              const isSelected = selectedMode === mode.id;

              return (
                <div
                  key={mode.id}
                  onClick={() => setSelectedMode(mode.id)}
                  className={`
                    relative p-6 rounded-xl border-2 cursor-pointer transition-all duration-300
                    ${
                      isSelected
                        ? `border-[${mode.color}] bg-${mode.bgColor} shadow-lg scale-[1.02]`
                        : `border-${mode.borderColor} hover:border-${mode.color}/50 hover:shadow-md`
                    }
                  `}
                  style={{
                    borderColor: isSelected
                      ? mode.color
                      : `${mode.borderColor}`,
                    backgroundColor: isSelected
                      ? `${mode.bgColor}`
                      : undefined,
                  }}
                >
                  {/* 选中角标 */}
                  {isSelected && (
                    <div
                      className="absolute top-0 right-0 w-8 h-8 rounded-bl-xl rounded-tr-xl flex items-center justify-center"
                      style={{ backgroundColor: mode.color }}
                    >
                      <svg
                        className="w-4 h-4 text-white"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </div>
                  )}

                  {/* 图标 */}
                  <div
                    className="w-12 h-12 rounded-lg flex items-center justify-center mb-4"
                    style={{
                      background: `linear-gradient(135deg, ${mode.color}20, ${mode.color}10)`,
                    }}
                  >
                    <Icon className="w-6 h-6" style={{ color: mode.color }} />
                  </div>

                  {/* 标题 */}
                  <h3 className="text-base font-bold text-slate-800 mb-2">
                    {mode.title}
                  </h3>

                  {/* 描述 */}
                  <p className="text-sm text-slate-600 mb-4 leading-relaxed">
                    {mode.description}
                  </p>

                  {/* 特性列表 */}
                  <ul className="space-y-2">
                    {mode.features.map((feature, index) => (
                      <li
                        key={index}
                        className="text-xs text-slate-600 flex items-start gap-2"
                      >
                        <span
                          className="flex-shrink-0 mt-0.5"
                          style={{ color: mode.color }}
                        >
                          {feature.startsWith("⚠") ? "⚠" : "✓"}
                        </span>
                        <span>{feature.replace(/^[⚠✓]\s*/, "")}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>

          {/* 警告提示 */}
          {selectedMode === "replace" && (
            <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-bold text-amber-800">
                  数据删除警告
                </h4>
                <p className="text-xs text-amber-700 mt-1">
                  此操作将永久删除您的个人空间数据，包括所有组件、项目和文档。删除后无法恢复，请谨慎选择！
                </p>
              </div>
            </div>
          )}
        </div>

        {/* 底部操作栏 */}
        <div className="flex items-center justify-end gap-3 px-8 py-5 border-t border-slate-100 bg-slate-50">
          <button
            onClick={onClose}
            className="px-6 py-2.5 border border-slate-200 text-slate-700 rounded-lg font-medium hover:bg-white hover:border-slate-300 transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selectedMode}
            className="px-6 py-2.5 bg-[#3182ce] text-white rounded-lg font-medium hover:bg-[#2b6cb0] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <span>确认升级</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// 警告图标组件
function AlertTriangle({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      className={className}
      style={style}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
      />
    </svg>
  );
}
