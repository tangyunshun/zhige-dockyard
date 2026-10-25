"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  Briefcase,
  Building2,
  ShieldCheck,
  Shield,
  X,
  Edit2,
  Plus,
  Loader2,
  CheckCircle2,
  Layers,
  Ban,
  Power,
} from "lucide-react";
import { PostIcon } from "./PostIcon";
import { StatusBadge, ActionButton } from "@/components/common";
import { WorkspacePermissionMatrixModal } from "./WorkspacePermissionMatrixModal";

export interface UsedWorkspaceInfo {
  id: string;
  name: string;
  type?: string;
  memberCount: number;
}

export interface StandardPostDetailData {
  id: string;
  name: string;
  code: string;
  description: string;
  color: string;
  icon?: string | null;
  status: "ACTIVE" | "DISABLED" | string;
  sortOrder?: number;
  usageCount?: number;
  totalAssignedMembers?: number;
  usedWorkspaces?: UsedWorkspaceInfo[];
  createdAt?: string;
  updatedAt?: string;
}

interface StandardPostDetailModalProps {
  post: StandardPostDetailData;
  onClose: () => void;
  // 企业空间场景回调与状态（当处于企业空间工作控制台时）
  onAdd?: () => void;
  isAdding?: boolean;
  // 超管管理场景回调（仅在超管后台管理页面传入）
  onToggleStatus?: (post: StandardPostDetailData) => void;
  onEdit?: (post: StandardPostDetailData) => void;
  /** 是否强制使用管理员视角（默认依据是否传入 onToggleStatus / onEdit 自动判断） */
  mode?: "admin" | "workspace";
}

export function StandardPostDetailModal({
  post,
  onClose,
  onAdd,
  isAdding = false,
  onToggleStatus,
  onEdit,
  mode,
}: StandardPostDetailModalProps) {
  const [mounted, setMounted] = useState(false);
  const [viewingWorkspaceMatrix, setViewingWorkspaceMatrix] = useState<UsedWorkspaceInfo | null>(null);

  useEffect(() => {
    setMounted(true);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  if (!mounted) return null;

  // 判断当前展示视角：管理员视角 vs 企业租户视角
  const isAdminMode = mode === "admin" || Boolean(onToggleStatus || onEdit);

  const modalContent = (
    <div
      // 层级契约（z-index 卡位，勿随意调整）：
      //  - 必须高于「添加岗位(系统库)」等列表级弹窗（z-[9999]），否则从弹窗内打开详情会被盖住；
      //  - 必须低于后台岗位页的「停用检查/二次确认」弹窗（z-[10050]）——那些弹窗会在本详情弹窗
      //    之上直接打开（不先关闭详情），若本层过高会把它们反盖住。
      className="fixed inset-0 z-[10020] flex items-center justify-center p-3 sm:p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in-50 duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-xl w-full overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ==================== 1. 弹窗头部 ==================== */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-xs shrink-0"
              style={{ backgroundColor: post.color || "#3182ce" }}
            >
              <PostIcon iconKey={post.icon} className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-black text-slate-800 truncate">
                  {post.name}
                </h3>
                {isAdminMode ? (
                  /* 状态只读：停用/启用统一走底部操作按钮 */
                  <StatusBadge
                    compact
                    tone={post.status === "ACTIVE" ? "active" : "inactive"}
                    title={
                      post.status === "ACTIVE"
                        ? "该岗位已启用分发，新企业空间可一键导入"
                        : "该岗位已停用分发，新企业空间无法导入"
                    }
                  >
                    {post.status === "ACTIVE" ? "启用分发中" : "已停用"}
                  </StatusBadge>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black border bg-emerald-50 text-emerald-700 border-emerald-200/80 shrink-0 inline-flex items-center gap-1">
                    <CheckCircle2 className="w-2.5 h-2.5" />
                    <span>官方标准库岗位</span>
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-400 font-medium">
                <span className="font-mono font-bold text-slate-500">
                  代码: {post.code}
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors shrink-0 cursor-pointer ml-2"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ==================== 2. 弹窗主体内容 ==================== */}
        <div className="p-6 overflow-y-auto space-y-4.5 text-left flex-1">
          {/* A. 企业空间专属视角：核心指标三栏透视 */}
          {!isAdminMode ? (
            <div className="grid grid-cols-3 gap-2.5">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-left">
                <span className="text-[10px] text-slate-400 font-bold block">全网装配空间</span>
                <span className="text-xs font-black text-[#3182ce] mt-1 block">
                  {post.usageCount || 0} 个空间
                </span>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-left">
                <span className="text-[10px] text-slate-400 font-bold block">全网在编成员</span>
                <span className="text-xs font-black text-slate-800 mt-1 block">
                  {post.totalAssignedMembers || 0} 位
                </span>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-left">
                <span className="text-[10px] text-slate-400 font-bold block">岗位专属标识色</span>
                <div className="flex items-center gap-1.5 mt-1">
                  <span
                    className="w-3.5 h-3.5 rounded-md shrink-0 shadow-2xs"
                    style={{ backgroundColor: post.color || "#3182ce" }}
                  />
                  <span className="text-xs font-mono font-bold text-slate-700 truncate">
                    {post.color || "#3182ce"}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            /* 超管后台视角指标 */
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                <span className="text-[10px] text-slate-400 font-bold block">全网装配量</span>
                <span className="text-base font-black text-[#3182ce] mt-1 block">
                  {post.usageCount || 0} 个空间
                </span>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                <span className="text-[10px] text-slate-400 font-bold block">排序权重</span>
                <span className="text-base font-black text-slate-700 mt-1 block">
                  No. {post.sortOrder || 1}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                <span className="text-[10px] text-slate-400 font-bold block">主题配色</span>
                <div className="flex items-center gap-1.5 mt-1">
                  <span
                    className="w-4 h-4 rounded-md shrink-0 shadow-2xs"
                    style={{ backgroundColor: post.color || "#3182ce" }}
                  />
                  <span className="text-xs font-mono font-bold text-slate-700">
                    {post.color || "#3182ce"}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* B. 岗位职责描述与业务定位（数据库真实字段） */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <h4 className="text-xs font-black text-slate-700 flex items-center gap-1.5">
                <Briefcase className="w-3.5 h-3.5 text-[#3182ce]" />
                <span>岗位职责定位与专业范畴</span>
              </h4>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-50/80 border border-slate-200/80 text-xs text-slate-700 leading-relaxed font-medium">
              {post.description || "暂未录入该岗位的详细业务定位与职责说明。"}
            </div>
          </div>

          {/* C. 企业空间专属视角：引入后的组件权限说明（如实描述真实业务规则，不虚构任何预置授权） */}
          {!isAdminMode ? (
            <div className="p-3.5 rounded-xl bg-blue-50/50 border border-blue-100/80 space-y-2">
              <div className="flex items-center gap-2">
                <Layers className="w-3.5 h-3.5 text-[#3182ce]" />
                <span className="text-xs font-black text-slate-700">引入后的组件权限说明</span>
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed font-medium">
                引入后该岗位<span className="font-black text-slate-800">默认不携带任何组件权限</span>
                （系统不会预置任何组件授权）。空间管理员需在「权限 → 组件授权矩阵」中，
                按需勾选该岗位可查看与可执行的组件。
              </p>
            </div>
          ) : (
            /* 超管后台视角：已装配企业空间透视清单 */
            <div>
              <h4 className="text-xs font-black text-slate-700 mb-2 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-[#3182ce]" />
                  <span>已装配此岗位的企业空间清单</span>
                </span>
                <span className="text-[11px] font-bold text-slate-500">
                  已装配 {post.usageCount || 0} 个空间 · 共 {post.totalAssignedMembers || 0} 位在编成员
                </span>
              </h4>

              {post.usedWorkspaces && post.usedWorkspaces.length > 0 ? (
                <div className="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden divide-y divide-slate-100 max-h-48 overflow-y-auto">
                  {post.usedWorkspaces.map((ws) => (
                    <div
                      key={ws.id}
                      className="p-2.5 px-3 flex items-center justify-between text-xs hover:bg-white transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Building2 className="w-3.5 h-3.5 text-[#3182ce] shrink-0" />
                        <span className="font-black text-slate-700 truncate">{ws.name}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-[#3182ce] font-bold shrink-0">
                          {ws.memberCount} 位在编成员
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setViewingWorkspaceMatrix(ws)}
                        className="text-[11px] font-bold text-[#3182ce] hover:text-white hover:bg-[#3182ce] bg-white border border-blue-200/80 px-2 py-1 rounded-md transition-all flex items-center gap-1 shrink-0 ml-2 cursor-pointer shadow-2xs"
                        title={`查看【${ws.name}】空间岗位权限矩阵`}
                      >
                        <Shield className="w-3 h-3 text-[#3182ce]" />
                        <span>空间权限</span>
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-3.5 rounded-xl bg-slate-50/70 border border-slate-200 text-xs text-slate-400 text-center font-medium">
                  全平台暂无企业空间装配此岗位。各空间负责人可在其企业权限矩阵中一键导入使用。
                </div>
              )}
            </div>
          )}

        </div>

        {/* ==================== 3. 弹窗底部操作区 ==================== */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between shrink-0">
          {/* 左侧说明 */}
          <div className="text-xs text-slate-400 font-medium">
            {!isAdminMode ? (
              <span className="inline-flex items-center gap-1 text-slate-500 font-semibold">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>知阁标准企业岗位体系</span>
              </span>
            ) : onToggleStatus ? (
              post.status === "ACTIVE" ? (
                <ActionButton
                  compact
                  variant="warn"
                  icon={<Ban className="w-3 h-3" />}
                  title="停用该岗位的分发"
                  onClick={() => onToggleStatus(post)}
                >
                  停用该岗位分发
                </ActionButton>
              ) : (
                <ActionButton
                  compact
                  variant="success"
                  icon={<Power className="w-3 h-3" />}
                  title="启用该岗位的分发"
                  onClick={() => onToggleStatus(post)}
                >
                  启用该岗位分发
                </ActionButton>
              )
            ) : null}
          </div>

          {/* 右侧动作 */}
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer"
            >
              取消
            </button>

            {/* 超管编辑按钮：与列表一致，启用中的岗位不可编辑，需先停用 */}
            {isAdminMode && onEdit && (
              <ActionButton
                variant="primary"
                icon={<Edit2 className="w-3.5 h-3.5" />}
                disabledReason={
                  post.status === "ACTIVE" ? "启用中的岗位不可编辑，请先停用" : undefined
                }
                title="编辑该岗位"
                onClick={() => onEdit(post)}
              >
                编辑此岗位
              </ActionButton>
            )}

            {/* 企业空间引入该岗位按钮（强化业务闭环） */}
            {onAdd && (
              <button
                type="button"
                disabled={isAdding}
                onClick={onAdd}
                className="px-5 py-2 text-xs font-black text-white bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] hover:from-[#2b6cb0] hover:to-[#2c5282] rounded-xl shadow-md shadow-blue-500/20 hover:shadow-lg transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 active:scale-95"
              >
                {isAdding ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Plus className="w-3.5 h-3.5" />
                )}
                <span>引入到当前企业空间</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 嵌套弹出的工作空间权限矩阵信息查看弹窗 */}
      {viewingWorkspaceMatrix && (
        <WorkspacePermissionMatrixModal
          workspace={viewingWorkspaceMatrix}
          initialPostName={post.name}
          onClose={() => setViewingWorkspaceMatrix(null)}
        />
      )}
    </div>
  );

  return createPortal(modalContent, document.body);
}
