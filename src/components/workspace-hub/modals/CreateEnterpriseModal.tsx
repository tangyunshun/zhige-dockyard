"use client";

import React from "react";
import { Building2, ArrowRight } from "lucide-react";

interface CreateEnterpriseModalProps {
  isOpen: boolean;
  onClose: () => void;
  newEnterpriseName: string;
  setNewEnterpriseName: (name: string) => void;
  newEnterpriseEmail: string;
  setNewEnterpriseEmail: (email: string) => void;
  newEnterprisePhone: string;
  setNewEnterprisePhone: (phone: string) => void;
  newEnterpriseTeamSize: string;
  setNewEnterpriseTeamSize: (size: string) => void;
  newEnterpriseDesc: string;
  setNewEnterpriseDesc: (desc: string) => void;
  creatingEnterprise: boolean;
  onCreate: (e: React.FormEvent) => void;
}

export default function CreateEnterpriseModal({
  isOpen,
  onClose,
  newEnterpriseName,
  setNewEnterpriseName,
  newEnterpriseEmail,
  setNewEnterpriseEmail,
  newEnterprisePhone,
  setNewEnterprisePhone,
  newEnterpriseTeamSize,
  setNewEnterpriseTeamSize,
  newEnterpriseDesc,
  setNewEnterpriseDesc,
  creatingEnterprise,
  onCreate,
}: CreateEnterpriseModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 relative animate-in fade-in zoom-in duration-200">
        {/* 关闭按钮 */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 transition-all border-none cursor-pointer text-slate-500 text-xl font-bold"
          disabled={creatingEnterprise}
        >
          ×
        </button>

        {/* 标题 */}
        <div className="mb-6 pb-3 border-b border-slate-100 text-left">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#2b6cb0] to-[#3182ce] flex items-center justify-center flex-shrink-0">
              <Building2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-800">创建企业协作空间</h2>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                开启团队协同研发，共享组件工坊与企业资源额度
              </p>
            </div>
          </div>
        </div>

        {/* 表单 */}
        <form onSubmit={onCreate} className="space-y-4 text-left">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
              <span>空间名称</span>
              <span className="text-red-500 font-bold">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="例如：知阁技术研发中心"
              value={newEnterpriseName}
              onChange={(e) => setNewEnterpriseName(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-[#2b6cb0] focus:ring-1 focus:ring-[#2b6cb0]/20"
              maxLength={50}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                <span>联系邮箱</span>
                <span className="text-red-500 font-bold">*</span>
              </label>
              <input
                type="email"
                required
                placeholder="example@company.com"
                value={newEnterpriseEmail}
                onChange={(e) => setNewEnterpriseEmail(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-[#2b6cb0] focus:ring-1 focus:ring-[#2b6cb0]/20"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">联系电话</label>
              <input
                type="text"
                placeholder="工作电话（可选）"
                value={newEnterprisePhone}
                onChange={(e) => setNewEnterprisePhone(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-[#2b6cb0] focus:ring-1 focus:ring-[#2b6cb0]/20"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">团队人数规模</label>
            <select
              value={newEnterpriseTeamSize}
              onChange={(e) => setNewEnterpriseTeamSize(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-[#2b6cb0] focus:ring-1 focus:ring-[#2b6cb0]/20 bg-white"
            >
              <option value="1-5">1-5 人（初创小团队）</option>
              <option value="6-20">6-20 人（中小型协同）</option>
              <option value="21-50">21-50 人（中型项目组）</option>
              <option value="51-100">51-100 人（大型技术部门）</option>
              <option value="101-200">101-200 人（跨部门协作）</option>
              <option value="200+">200+ 人（企业级全员）</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">空间简介与描述</label>
            <textarea
              placeholder="简单描述该协作空间的使用诉求或组织规划（可选）"
              value={newEnterpriseDesc}
              onChange={(e) => setNewEnterpriseDesc(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-[#2b6cb0] focus:ring-1 focus:ring-[#2b6cb0]/20 min-h-[60px] max-h-[120px]"
              maxLength={200}
            />
          </div>

          {/* 按钮 */}
          <div className="flex items-center gap-3 pt-3 border-t border-slate-100 mt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 bg-slate-100 text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-200 transition-all border-none cursor-pointer"
              disabled={creatingEnterprise}
            >
              取消
            </button>
            <button
              type="submit"
              disabled={creatingEnterprise}
              className="flex-1 py-2 bg-gradient-to-r from-[#2b6cb0] to-[#3182ce] text-white text-xs font-bold rounded-lg hover:shadow-lg transition-all border-none cursor-pointer flex items-center justify-center gap-1.5"
            >
              {creatingEnterprise ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>正在创建...</span>
                </>
              ) : (
                <>
                  <span>确认创建</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
