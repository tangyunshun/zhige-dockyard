"use client";

import React from "react";
import { AlertTriangle, Building2, User } from "lucide-react";

export interface DeleteConfirmModalProps {
  isOpen: boolean;
  title: string;
  confirmWord: string;      // 用户必须输入的确认词，如 "确认注销" 或 "重置"
  warnings: string[];
  workspaceName?: string;
  workspaceMeta?: string;   // 辅助副标题
  isLoading: boolean;
  deleteConfirmText: string; // 当前用户输入的内容
  setDeleteConfirmText: (text: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function DeleteConfirmModal({
  isOpen,
  title,
  confirmWord,
  warnings,
  workspaceName,
  workspaceMeta,
  isLoading,
  deleteConfirmText,
  setDeleteConfirmText,
  onConfirm,
  onCancel,
}: DeleteConfirmModalProps) {
  if (!isOpen) return null;

  const isMatched = deleteConfirmText === confirmWord;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full my-8 animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh]">
        {/* 头部 */}
        <div className="p-6 border-b border-slate-200 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-800">{title}</h2>
              <p className="text-xs text-slate-500">此操作涉及高危资产变更，请仔细阅读以下信息</p>
            </div>
          </div>
        </div>

        {/* 内容区域 */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1 text-left">
          {/* 检测完成标识（注销空间特有，或通用） */}
          {confirmWord === "确认注销" && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-xl">
              <div className="flex items-start gap-2">
                <div className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5">
                  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-xs font-bold text-green-800">✅ 系统安全检测完成</h3>
                  <p className="text-xs text-green-700 mt-0.5">该协作空间符合注销安全标准，资产关联校验无冲突。</p>
                </div>
              </div>
            </div>
          )}

          {/* 警告列表 */}
          {warnings && warnings.length > 0 && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4.5 h-4.5 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-xs font-bold text-red-800 mb-2">⚠️ 操作后将产生以下永久性影响：</h3>
                  <ul className="space-y-1">
                    {warnings.map((warning, index) => (
                      <li key={index} className="text-xs text-red-700 flex items-start gap-1.5">
                        <span className="text-red-500 mt-0.5">•</span>
                        <span>{warning}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* 被操作空间信息 */}
          {workspaceName && (
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
              <div className="flex items-center gap-2 mb-2">
                {confirmWord === "重置" ? (
                  <User className="w-4 h-4 text-slate-400" />
                ) : (
                  <Building2 className="w-4 h-4 text-slate-400" />
                )}
                <span className="text-xs font-bold text-slate-600">目标工作空间：</span>
              </div>
              <div className="ml-6">
                <div className="text-sm font-black text-slate-800">{workspaceName}</div>
                {workspaceMeta && <div className="text-xs text-slate-500 mt-0.5">{workspaceMeta}</div>}
              </div>
            </div>
          )}

          {/* 重要提示 */}
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4.5 h-4.5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="text-xs font-bold text-amber-800">重要提示：</h3>
                <p className="text-xs text-amber-700 mt-0.5">
                  重置或注销操作<span className="font-black text-red-600">不可逆</span>。该空间下所有的组件资产、技术归档与算力历史将全部清空。
                </p>
              </div>
            </div>
          </div>

          {/* 输入校验框 */}
          <div className="p-4 bg-white border-2 border-slate-200 rounded-xl">
            <label className="block text-xs font-bold text-slate-700 mb-2">
              请输入 <strong className="text-red-600">"{confirmWord}"</strong> 以确认授权：
            </label>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder={confirmWord}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none text-xs font-mono"
              autoComplete="off"
            />
            {deleteConfirmText && !isMatched && (
              <div className="mt-1.5 text-[10px] text-red-600 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>输入字符与确认词不匹配</span>
              </div>
            )}
            {isMatched && (
              <div className="mt-1.5 text-[10px] text-green-600 flex items-center gap-1">
                <svg className="w-3.5 h-3.5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>验证通过，您可以继续操作</span>
              </div>
            )}
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="p-6 border-t border-slate-200 flex items-center gap-3 bg-slate-50 rounded-b-2xl flex-shrink-0">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-50 transition-all cursor-pointer"
            disabled={isLoading}
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading || !isMatched}
            className="flex-1 py-2.5 bg-gradient-to-r from-red-500 to-red-600 text-white text-xs font-bold rounded-lg hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 border-none cursor-pointer"
          >
            {isLoading ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>正在执行...</span>
              </>
            ) : (
              <>
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>确认执行</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
