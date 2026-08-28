"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare, Check } from "lucide-react";
import { useToast } from "@/components/Toast";
import { getAuthToken } from "@/utils/auth";

interface User {
  id: string;
  name: string | null;
  email: string | null;
}

export default function GlobalFeedbackModal() {
  const toast = useToast();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [feedbackType, setFeedbackType] = useState("suggestion");
  const [feedbackTitle, setFeedbackTitle] = useState("");
  const [feedbackContent, setFeedbackContent] = useState("");
  const [feedbackContact, setFeedbackContact] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submittedTicketId, setSubmittedTicketId] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    // 监听全局触发事件或加载用户信息
    fetchUserInfo();
    const handleOpenFeedbackEvent = () => {
      setSubmittedTicketId(null);
      setIsOpen(true);
    };
    window.addEventListener("open-global-feedback", handleOpenFeedbackEvent);
    return () => {
      window.removeEventListener("open-global-feedback", handleOpenFeedbackEvent);
    };
  }, []);

  const fetchUserInfo = async () => {
    try {
      const res = await fetch("/api/auth/me");
      if (res.ok) {
        const data = await res.json();
        if (data.user) {
          setUser(data.user);
          if (data.user.email) {
            setFeedbackContact(data.user.email);
          }
        }
      }
    } catch (e) {
      // 允许匿名反馈
    }
  };

  // 提交工单至后端 /api/feedback (写入 MySQL 物理表 userfeedback)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // 提交官方工单需登录后方可操作（兜底拦截）
    if (!getAuthToken()) {
      toast.info("提交官方工单需先登录");
      router.push("/auth/login?redirect=" + encodeURIComponent(window.location.pathname));
      return;
    }
    const cleanTitle = feedbackTitle.trim();
    const cleanContent = feedbackContent.trim();

    if (!cleanTitle) {
      toast.error("请输入工单主题标题");
      return;
    }
    if (!cleanContent || cleanContent.length < 10) {
      toast.error("工单详细说明至少需要 10 个字符");
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: feedbackType,
          title: cleanTitle,
          content: cleanContent,
          contact: feedbackContact,
        }),
      });

      if (res.ok) {
        const json = await res.json();
        const ticketId = json.data?.id || `FB_${Date.now()}`;
        setSubmittedTicketId(ticketId);
        toast.success(`官方工单 ${ticketId} 已成功写入系统数据库！`);
        setFeedbackTitle("");
        setFeedbackContent("");
      } else {
        const errJson = await res.json();
        toast.error(errJson.error || "工单提交失败，请重试");
      }
    } catch (err: any) {
      toast.error("网络通信失败，请检查网络");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {/* 1. 右下角全局常驻悬浮工单胶囊按钮 */}
      <button
        onClick={() => {
          // 提交官方工单需登录后方可操作
          if (!getAuthToken()) {
            toast.info("提交官方工单需先登录");
            router.push("/auth/login?redirect=" + encodeURIComponent(window.location.pathname));
            return;
          }
          setSubmittedTicketId(null);
          setIsOpen(true);
        }}
        aria-label="提交官方工单"
        className="fixed bottom-22 right-6 md:bottom-26 md:right-10 z-[89] px-4 h-11 bg-white hover:bg-indigo-50 text-indigo-700 border border-indigo-200/90 rounded-full shadow-xl hover:shadow-2xl transition-all duration-300 flex items-center gap-2 cursor-pointer font-extrabold text-xs hover:scale-105 active:scale-95"
      >
        <MessageSquare className="w-4 h-4 text-indigo-600" />
        <span>提交官方工单</span>
      </button>

      {/* 2. 全局工单持久化 Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-[24px] border border-white/90 shadow-2xl max-w-lg w-full p-6 space-y-4 animate-fadeIn text-left">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-extrabold text-slate-800 flex items-center gap-2">
                <MessageSquare className="w-4.5 h-4.5 text-indigo-600" />
                提交官方服务与架构工单
              </h3>
              <button
                onClick={() => setIsOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold border-none bg-transparent cursor-pointer text-sm"
              >
                ✕
              </button>
            </div>

            {submittedTicketId ? (
              <div className="py-6 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center mx-auto">
                  <Check className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-extrabold text-slate-800">官方工单已提交成功！</h4>
                <div className="p-3 bg-slate-50 font-mono text-indigo-600 rounded-xl border border-slate-200 font-bold text-xs inline-block">
                  工单流水号: {submittedTicketId}
                </div>
                <p className="text-xs text-slate-500 font-medium max-w-sm mx-auto leading-relaxed">
                  已物理存入系统数据库 `userfeedback` 数据表。官方架构师团队将在 24 小时内跟进并反馈。
                </p>
                <button
                  onClick={() => setIsOpen(false)}
                  className="px-5 h-9 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs transition-all cursor-pointer shadow-xs mt-2"
                >
                  完成并关闭
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4 text-xs">
                <div>
                  <label className="text-slate-600 font-bold block mb-1.5">反馈工单分类</label>
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { id: "suggestion", label: "功能建议" },
                      { id: "bug", label: "问题报错" },
                      { id: "experience", label: "文档/UI 优化" },
                      { id: "other", label: "架构咨询" },
                    ].map((item) => (
                      <button
                        type="button"
                        key={item.id}
                        onClick={() => setFeedbackType(item.id)}
                        className={`h-8 rounded-xl font-bold transition-all cursor-pointer text-[11px] ${
                          feedbackType === item.id
                            ? "bg-indigo-600 text-white shadow-xs"
                            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-slate-600 font-bold block mb-1.5">
                    工单主题标题 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={feedbackTitle}
                    onChange={(e) => setFeedbackTitle(e.target.value)}
                    placeholder="如：空间解散校验规则或组件调起异常建议"
                    maxLength={50}
                    className="w-full h-9 px-3 bg-slate-50 rounded-xl border border-slate-200 font-bold focus:outline-none focus:border-indigo-500 text-slate-800 text-xs"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-slate-600 font-bold block">
                      详细说明内容 <span className="text-red-500">*</span>
                    </label>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {feedbackContent.length} / 5000 字
                    </span>
                  </div>
                  <textarea
                    value={feedbackContent}
                    onChange={(e) => setFeedbackContent(e.target.value)}
                    placeholder="请详细描述您遇到的问题、操作步骤或改进建议，至少 10 个字符..."
                    rows={4}
                    className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 font-medium focus:outline-none focus:border-indigo-500 text-slate-800 text-xs resize-none"
                  />
                </div>

                <div>
                  <label className="text-slate-600 font-bold block mb-1.5">联系方式 (选填)</label>
                  <input
                    type="text"
                    value={feedbackContact}
                    onChange={(e) => setFeedbackContact(e.target.value)}
                    placeholder="您的联系邮箱或手机号"
                    className="w-full h-9 px-3 bg-slate-50 rounded-xl border border-slate-200 font-medium focus:outline-none focus:border-indigo-500 text-slate-800 text-xs"
                  />
                </div>

                <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-4 h-9 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs transition-all shadow-xs cursor-pointer disabled:opacity-50"
                  >
                    {submitting ? "提交写入中..." : "提交官方工单"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="px-4 h-9 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold text-xs transition-all cursor-pointer"
                  >
                    取消
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
