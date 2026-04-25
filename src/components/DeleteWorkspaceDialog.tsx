"use client";

import { useState, useEffect } from "react";
import { X, AlertTriangle, Users, FolderOpen, Database, Shield } from "lucide-react";

interface WorkspaceInfo {
  id: string;
  name: string;
  type: string;
  memberCount: number;
  componentCount: number;
}

interface DeleteCheckResult {
  canDelete: boolean;
  workspace: WorkspaceInfo;
  issues: string[];
  warnings: string[];
}

interface DeleteWorkspaceDialogProps {
  isOpen: boolean;
  checkResult: DeleteCheckResult | null;
  onConfirm: () => void;
  onCancel: () => void;
  isDeleting?: boolean;
}

export function DeleteWorkspaceDialog({
  isOpen,
  checkResult,
  onConfirm,
  onCancel,
  isDeleting = false,
}: DeleteWorkspaceDialogProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [showConfirmInput, setShowConfirmInput] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      setShowConfirmInput(false);
      setConfirmText("");
      document.body.style.overflow = "hidden";
    } else {
      const timer = setTimeout(() => setIsVisible(false), 300);
      document.body.style.overflow = "unset";
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!isVisible && !isOpen) return null;

  const workspace = checkResult?.workspace;
  const warnings = checkResult?.warnings || [];

  const handleContinueClick = () => {
    setShowConfirmInput(true);
  };

  const handleFinalConfirm = () => {
    if (confirmText === "确认注销") {
      onConfirm();
    }
  };

  return (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center transition-opacity duration-300 ${
        isOpen ? "opacity-100" : "opacity-0"
      }`}
    >
      {/* 背景遮罩 */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
      />

      {/* 对话框 */}
      <div
        className={`relative bg-white rounded-2xl shadow-2xl max-w-xl w-full mx-4 transform transition-all duration-300 ${
          isOpen ? "scale-100 translate-y-0" : "scale-95 translate-y-4"
        }`}
        style={{ maxHeight: '90vh', overflowY: 'auto' }}
      >
        {/* 关闭按钮 */}
        <button
          onClick={onCancel}
          disabled={isDeleting}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors p-1.5 rounded-full focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <X className="w-5 h-5" />
        </button>

        {/* 内容区域 */}
        <div className="p-6">
          {/* 标题区域 */}
          <div className="flex items-start gap-4 mb-6">
            <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-7 h-7 text-red-600" />
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-black text-slate-800 mb-2">
                注销企业空间
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                这是一个重要操作，请仔细阅读以下信息
              </p>
            </div>
          </div>

          {/* 空间信息卡片 */}
          {workspace && (
            <div className="mb-6 p-4 bg-slate-50 rounded-xl border border-slate-200">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#f59e0b] to-[#d97706] flex items-center justify-center flex-shrink-0">
                  <Shield className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-black text-slate-800 truncate" title={workspace.name}>
                    {workspace.name}
                  </div>
                  <div className="text-xs text-slate-500">
                    {workspace.type === "ENTERPRISE" ? "企业空间" : "个人空间"}
                  </div>
                </div>
              </div>

              {/* 统计信息 */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-slate-400" />
                  <div>
                    <div className="text-xs text-slate-500">成员数</div>
                    <div className="text-sm font-bold text-slate-700">
                      {workspace.memberCount} 人
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <FolderOpen className="w-4 h-4 text-slate-400" />
                  <div>
                    <div className="text-xs text-slate-500">组件数</div>
                    <div className="text-sm font-bold text-slate-700">
                      {workspace.componentCount} 个
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 检测信息 */}
          <div className="mb-6 space-y-3">
            {/* 检测通过提示 */}
            <div className="flex items-start gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
              <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-green-800">
                  环境检测通过
                </p>
                <p className="text-xs text-green-700 mt-1">
                  该空间符合注销条件，可以继续操作
                </p>
              </div>
            </div>

            {/* 警告信息 */}
            {warnings.length > 0 && (
              <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-bold text-orange-800 mb-2">
                      ⚠️ 注销后将产生以下影响：
                    </p>
                    <ul className="space-y-1.5">
                      {warnings.map((warning, index) => (
                        <li key={index} className="text-xs text-orange-700 flex items-start gap-2">
                          <span className="text-orange-500 mt-0.5">•</span>
                          <span>{warning}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {/* 重要提示 */}
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-start gap-3">
                <Database className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-bold text-red-800 mb-1">
                    数据不可恢复
                  </p>
                  <p className="text-xs text-red-700">
                    注销后，该空间的所有数据将被标记为已删除，所有成员将失去访问权限。此操作不可撤销！
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* 确认输入框 */}
          {showConfirmInput ? (
            <div className="mb-6">
              <label className="block text-sm font-bold text-slate-700 mb-2">
                请输入{" "}
                <span className="text-red-600 font-black">"确认注销"</span>{" "}
                继续操作
              </label>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="确认注销"
                className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-red-500 focus:ring-2 focus:ring-red-200 outline-none transition-all text-sm font-bold"
                disabled={isDeleting}
                autoFocus
              />
            </div>
          ) : (
            <div className="mb-6 p-4 bg-slate-50 rounded-xl border border-slate-200">
              <p className="text-sm text-slate-600 leading-relaxed">
                如果您确定要注销此空间，请点击下方按钮继续。系统将进行最终确认。
              </p>
            </div>
          )}

          {/* 操作按钮 */}
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              disabled={isDeleting}
              className="flex-1 px-4 py-3 bg-slate-100 text-slate-700 text-sm font-bold rounded-xl hover:bg-slate-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              取消
            </button>
            {!showConfirmInput ? (
              <button
                onClick={handleContinueClick}
                disabled={isDeleting}
                className="flex-1 px-4 py-3 bg-red-600 text-white text-sm font-bold rounded-xl hover:bg-red-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-red-500/30"
              >
                继续注销
              </button>
            ) : (
              <button
                onClick={handleFinalConfirm}
                disabled={confirmText !== "确认注销" || isDeleting}
                className="flex-1 px-4 py-3 bg-red-600 text-white text-sm font-bold rounded-xl hover:bg-red-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-red-500/30 flex items-center justify-center gap-2"
              >
                {isDeleting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>正在注销...</span>
                  </>
                ) : (
                  <>
                    <Shield className="w-4 h-4" />
                    <span>确认注销</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
