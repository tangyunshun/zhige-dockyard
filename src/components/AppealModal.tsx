﻿"use client";

import React, { useState } from "react";
import { X, AlertCircle, CheckCircle, FileText, User, Phone, Mail } from "lucide-react";
import { useToast } from "@/components/Toast";

interface AppealModalProps {
  account: string;
  onClose: () => void;
}

export default function AppealModal({ account, onClose }: AppealModalProps) {
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    appealReason: "",
    contactInfo: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.appealReason.trim()) {
      toast.error("请填写申诉原因");
      return;
    }

    if (formData.appealReason.trim().length < 10) {
      toast.error("申诉原因至少 10 个字");
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch("/api/account-appeal/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: "",
          userAccount: account,
          appealReason: formData.appealReason.trim(),
          contactInfo: formData.contactInfo.trim(),
        }),
      });

      const data = await res.json();

      if (res.ok) {
        toast.success(data.message, 3000);
        // 显示成功后关闭弹窗
        setTimeout(() => {
          onClose();
        }, 1500);
      } else {
        toast.error(data.message);
      }
    } catch (error) {
      console.error("Submit appeal error:", error);
      toast.error("提交失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* 头部 */}
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-[#3182ce] to-[#2563eb] rounded-xl flex items-center justify-center">
              <FileText className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900">账号申诉</h3>
              <p className="text-xs text-slate-500">提交申诉，请求解封账号</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 表单内容 */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* 账号信息提示 */}
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-blue-600 mt-0.5" />
              <div className="text-xs text-blue-800 space-y-1">
                <p>申诉账号：<span className="font-medium">{account || "未输入账号"}</span></p>
                <p className="text-blue-600">
                  提示：请详细填写申诉原因，管理员会在 1-3 个工作日内处理
                </p>
              </div>
            </div>
          </div>

          {/* 申诉原因 */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              申诉原因 <span className="text-red-500">*</span>
            </label>
            <textarea
              value={formData.appealReason}
              onChange={(e) =>
                setFormData({ ...formData, appealReason: e.target.value })
              }
              rows={5}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none transition-all resize-none"
              placeholder="请详细说明您的情况，例如：
1. 您认为账号被封禁的原因
2. 您是否有违规行为
3. 您的使用情况和诉求
4. 其他需要说明的信息"
              required
              minLength={10}
            />
            <p className="mt-1 text-xs text-slate-500">
              至少 10 个字，当前：{formData.appealReason.length}字
            </p>
          </div>

          {/* 联系方式 */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              联系方式 <span className="text-slate-400 font-normal">（选填）</span>
            </label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={formData.contactInfo}
                onChange={(e) =>
                  setFormData({ ...formData, contactInfo: e.target.value })
                }
                className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none transition-all"
                placeholder="手机/微信/QQ（方便管理员联系您）"
              />
            </div>
            <p className="mt-1 text-xs text-slate-500">
              填写联系方式有助于管理员与您沟通
            </p>
          </div>

          {/* 提交按钮 */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="flex-1 px-4 py-2.5 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 px-4 py-2.5 bg-gradient-to-r from-[#3182ce] to-[#2563eb] text-white rounded-lg text-sm font-medium hover:shadow-lg hover:shadow-[#3182ce]/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>提交中...</span>
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4" />
                  <span>提交申诉</span>
                </>
              )}
            </button>
          </div>

          {/* 底部提示 */}
          <div className="pt-2 border-t border-slate-100">
            <p className="text-xs text-slate-500 text-center">
              提交后管理员会在 1-3 个工作日内处理，请耐心等待
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}
