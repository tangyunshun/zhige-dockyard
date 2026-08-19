"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Footer from "@/components/Footer";
import { useToast } from "@/components/Toast";
import {
  BookOpen,
  Search,
  ChevronDown,
  MessageSquareText,
  Lightbulb,
  Bug,
  HeartHandshake,
  CircleHelp,
  Mail,
  Globe,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  Rocket,
  FileText,
  LifeBuoy,
} from "lucide-react";

interface UserInfo {
  name: string | null;
  email: string | null;
  phone: string | null;
}

// 反馈类型配置
const FEEDBACK_TYPES = [
  { value: "suggestion", label: "功能建议", icon: Lightbulb, desc: "希望平台新增或改进某项功能" },
  { value: "bug", label: "Bug 反馈", icon: Bug, desc: "在使用过程中遇到了异常或报错" },
  { value: "experience", label: "体验反馈", icon: HeartHandshake, desc: "对交互流程、页面设计提出建议" },
  { value: "other", label: "其他问题", icon: MessageSquareText, desc: "其他想告诉我们的话" },
] as const;

type FeedbackType = (typeof FEEDBACK_TYPES)[number]["value"];

// 常见问题（FAQ）—— 基于平台真实功能编写
const FAQS = [
  {
    q: "如何注册知阁·舟坊账号？",
    a: "点击首页导航栏的【免费体验工作台】即可发起注册。系统支持手机号/邮箱注册，并支持微信、QQ 第三方快捷登录。注册后即可创建个人空间开始使用平台功能。",
  },
  {
    q: "忘记密码怎么办？",
    a: "在登录页点击【忘记密码】，通过您注册时绑定的邮箱或手机号接收验证码，验证通过后即可设置新密码。如绑定的联系方式已不可用，可提交账号申诉，由平台管理员协助处理。",
  },
  {
    q: "什么是个人空间和企业空间？",
    a: "个人空间是专属于您个人的调试与任务执行单元，系统默认每月为每个个人空间划拨一定免费额度；企业空间面向团队协作，支持多租户隔离、精细权限树（RBAC）与共享资源额度，可通过【创建/升级企业空间】发起。",
  },
  {
    q: "为什么系统提示我进行异地登录验证？",
    a: "为保护您的账号安全，当系统检测到跨省/跨国等异常 IP 登录时，会触发验证码验证或二次身份确认（详见《隐私政策》第三条）。这是账号安全风控的必要措施，请按提示完成验证。",
  },
  {
    q: "如何注销账号？",
    a: "您可在账号设置中发起注销申请。注销需经过冷静期确认，冷静期结束后您的个人信息将被匿名化处理或删除（法律法规另有规定的除外）。冷静期内如需撤销注销，可前往系统提示页面取消。",
  },
  {
    q: "账号被锁定/封禁了怎么办？",
    a: "因多次密码错误或安全风险，账号可能被临时锁定或封禁。临时锁定到期后会自动解锁；如您认为封禁有误，可提交账号申诉，填写申诉理由与联系信息，平台管理员将尽快审核处理。",
  },
  {
    q: "组件任务如何执行，点数如何扣除？",
    a: "在工作空间操作台【挑选大厅】挂载组件后，点击【新建自动化任务】即可拉起组件参数表单，确认后点击【开始运行】。任务消耗的点数取决于组件复杂程度，可在空间统计页实时查看消耗流水。",
  },
  {
    q: "上传的数据会被用作 AI 训练吗？",
    a: "绝对不会。知阁·舟坊对商业机密执行极高等级保护，您的业务数据和运行结果绝不会被用作大模型的二次训练材料，并在缓存到期后彻底清除（详见《服务条款》与《隐私政策》）。",
  },
  {
    q: "如何升级会员等级或购买企业服务？",
    a: "您可在【会员中心】查看各等级权益并升级会员；企业空间升级、私有化部署等需求可点击页面底部联系官方邮箱 support@zhige-dockyard.com，或通过官网获取商务联系方式。",
  },
  {
    q: "《服务条款》和《隐私政策》在哪里查看？",
    a: "您可以在本页面下方的【平台文档】入口进入，或直接访问 /terms-of-service（服务条款）与 /privacy-policy（隐私政策）页面查看最新版本。",
  },
];

export default function HelpPage() {
  const router = useRouter();
  const toast = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedIndex, setExpandedIndex] = useState<number | null>(0);
  const [user, setUser] = useState<UserInfo | null>(null);

  // 反馈表单状态
  const [feedbackType, setFeedbackType] = useState<FeedbackType>("suggestion");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [contact, setContact] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // 加载登录用户信息，自动带出联系方式
  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.user) {
          setUser(data.user);
          const preferred = data.user.email || data.user.phone || "";
          if (preferred) setContact(preferred);
        }
      })
      .catch(() => {
        /* 未登录时静默处理 */
      });
  }, []);

  const filteredFaqs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return FAQS;
    return FAQS.filter(
      (item) =>
        item.q.toLowerCase().includes(q) || item.a.toLowerCase().includes(q),
    );
  }, [searchQuery]);

  const handleSubmitFeedback = async () => {
    if (!title.trim()) {
      toast.error("请填写反馈标题");
      return;
    }
    if (!content.trim()) {
      toast.error("请填写详细反馈内容");
      return;
    }
    if (content.trim().length < 10) {
      toast.error("反馈内容至少需要 10 个字符");
      return;
    }
    try {
      setSubmitting(true);
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: feedbackType,
          title: title.trim(),
          content: content.trim(),
          contact: contact.trim() || null,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success("反馈提交成功，感谢您的宝贵意见");
        setTitle("");
        setContent("");
        setFeedbackType("suggestion");
      } else {
        toast.error(data.error || "提交失败，请稍后重试");
      }
    } catch {
      toast.error("网络异常，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  };

  // 快捷入口
  const quickEntries = [
    {
      title: "文档中心",
      desc: "产品手册、组件能力与开发者接入指南",
      icon: BookOpen,
      color: "bg-blue-50 text-[#3182ce]",
      path: "/docs",
    },
    {
      title: "新手入门",
      desc: "从注册、空间中枢到第一次执行组件",
      icon: Rocket,
      color: "bg-emerald-50 text-emerald-600",
      path: "/docs?section=start",
    },
    {
      title: "安全中心",
      desc: "账号安全、数据防护与平台安全能力",
      icon: ShieldCheck,
      color: "bg-purple-50 text-purple-600",
      path: "/security",
    },
    {
      title: "解决方案",
      desc: "企业级部署与行业解决方案",
      icon: CircleHelp,
      color: "bg-orange-50 text-orange-600",
      path: "/solutions",
    },
    {
      title: "服务条款",
      desc: "平台服务协议与使用规范",
      icon: FileText,
      color: "bg-slate-100 text-slate-600",
      path: "/terms-of-service",
    },
    {
      title: "隐私政策",
      desc: "了解我们如何保护您的个人信息",
      icon: ShieldCheck,
      color: "bg-cyan-50 text-cyan-600",
      path: "/privacy-policy",
    },
  ];

  return (
    <div
      className="min-h-screen relative overflow-hidden bg-[#f0f8ff]"
      style={{
        backgroundImage:
          "radial-gradient(rgba(49, 130, 206, 0.08) 1.5px, transparent 1.5px)",
        backgroundSize: "24px 24px",
      }}
    >
      {/* 背景毛玻璃气泡 */}
      <div className="absolute top-0 left-[-10%] w-[35%] h-[35%] bg-[#3182ce]/[0.05] rounded-full blur-[130px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-[#10b981]/[0.05] rounded-full blur-[130px] pointer-events-none" />

      <main className="relative z-10 flex items-start justify-center px-4 py-8">
        <div className="w-full max-w-6xl">
          {/* 返回按钮 */}
          <button
            onClick={() => router.back()}
            className="inline-flex items-center gap-2 text-slate-600 hover:text-[#3182ce] mb-6 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="text-sm font-semibold">返回上一页</span>
          </button>

          {/* Hero 区 */}
          <div className="bg-white/80 backdrop-blur-xl rounded-[24px] shadow-xl border border-white/95 overflow-hidden mb-8">
            <div className="px-6 py-12 border-b border-slate-100 bg-gradient-to-r from-[#3182ce]/5 via-purple-500/[0.02] to-[#10b981]/5">
              <div className="text-center mb-8">
                <div className="inline-flex items-center gap-2 mb-4">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center shadow-lg shadow-[#2b6cb0]/20">
                    <LifeBuoy className="w-6 h-6 text-white" />
                  </div>
                </div>
                <h1 className="text-2xl md:text-3xl font-extrabold text-slate-800 tracking-tight">
                  帮助与反馈
                </h1>
                <p className="text-xs md:text-sm text-slate-500 max-w-2xl mx-auto font-bold mt-2.5 leading-relaxed">
                  在这里查找使用帮助、常见问题，或向我们反馈您的宝贵意见与建议
                </p>
              </div>

              {/* FAQ 搜索框 */}
              <div className="max-w-xl mx-auto relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="搜索常见问题，如：注销、异地登录、点数..."
                  className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-2xl text-sm text-slate-700 placeholder:text-slate-400 focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none transition-all shadow-sm"
                />
              </div>
            </div>

            {/* 快捷入口卡片 */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 p-6 bg-slate-50/50">
              {quickEntries.map((entry) => {
                const Icon = entry.icon;
                return (
                  <button
                    key={entry.title}
                    onClick={() => router.push(entry.path)}
                    className="p-4 bg-white border border-slate-200/60 rounded-2xl hover:border-[#3182ce] hover:shadow-md transition-all duration-300 text-left group cursor-pointer"
                  >
                    <div
                      className={`w-9 h-9 rounded-xl ${entry.color} flex items-center justify-center mb-2.5`}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    <h4 className="text-sm font-extrabold text-slate-800 group-hover:text-[#3182ce] transition-colors">
                      {entry.title}
                    </h4>
                    <p className="text-[11px] text-slate-500 font-semibold mt-1 leading-relaxed line-clamp-2">
                      {entry.desc}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
            {/* 左侧：FAQ */}
            <div className="lg:col-span-3 space-y-6">
              <div className="bg-white/80 backdrop-blur-xl rounded-[24px] shadow-xl border border-white/95 p-6 md:p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center shadow-sm text-white">
                    <CircleHelp className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-extrabold text-slate-800">
                      常见问题
                    </h2>
                    <p className="text-xs text-slate-500 font-semibold mt-0.5">
                      关于账号、空间、安全与点数的常见解答
                    </p>
                  </div>
                </div>

                {filteredFaqs.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center mx-auto mb-4 border border-slate-100">
                      <Search className="w-8 h-8 text-slate-400" />
                    </div>
                    <h3 className="text-sm font-black text-slate-800 mb-1">
                      未找到相关问题
                    </h3>
                    <p className="text-xs text-slate-500 font-semibold">
                      可以更换关键词，或通过下方反馈表单告诉我们
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredFaqs.map((faq, index) => {
                      const isOpen = expandedIndex === index;
                      return (
                        <div
                          key={faq.q}
                          className="border border-slate-200/70 rounded-2xl overflow-hidden transition-all duration-300 bg-white hover:border-[#3182ce]/40"
                        >
                          <button
                            onClick={() =>
                              setExpandedIndex(isOpen ? null : index)
                            }
                            className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left cursor-pointer group"
                          >
                            <span className="text-sm font-bold text-slate-800 group-hover:text-[#3182ce] transition-colors">
                              {faq.q}
                            </span>
                            <ChevronDown
                              className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-300 ${
                                isOpen ? "rotate-180 text-[#3182ce]" : ""
                              }`}
                            />
                          </button>
                          {isOpen && (
                            <div className="px-5 pb-4">
                              <p className="text-xs text-slate-600 leading-relaxed font-medium bg-slate-50 rounded-xl p-4">
                                {faq.a}
                              </p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* 右侧：反馈表单 */}
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white/80 backdrop-blur-xl rounded-[24px] shadow-xl border border-white/95 p-6 md:p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-sm text-white">
                    <MessageSquareText className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-extrabold text-slate-800">
                      意见反馈
                    </h2>
                    <p className="text-xs text-slate-500 font-semibold mt-0.5">
                      您的每一条建议都在帮助我们做得更好
                    </p>
                  </div>
                </div>

                {/* 反馈类型选择 */}
                <div className="grid grid-cols-2 gap-2.5 mb-5">
                  {FEEDBACK_TYPES.map((item) => {
                    const Icon = item.icon;
                    const active = feedbackType === item.value;
                    return (
                      <button
                        key={item.value}
                        onClick={() => setFeedbackType(item.value)}
                        className={`p-3 rounded-2xl border text-left transition-all duration-200 cursor-pointer ${
                          active
                            ? "border-[#3182ce] bg-[#3182ce]/5 ring-2 ring-[#3182ce]/20"
                            : "border-slate-200/70 hover:border-[#3182ce]/40"
                        }`}
                      >
                        <Icon
                          className={`w-5 h-5 mb-1.5 ${
                            active ? "text-[#3182ce]" : "text-slate-400"
                          }`}
                        />
                        <div
                          className={`text-xs font-extrabold ${
                            active ? "text-[#3182ce]" : "text-slate-700"
                          }`}
                        >
                          {item.label}
                        </div>
                        <div className="text-[10px] text-slate-400 font-semibold mt-0.5 leading-snug">
                          {item.desc}
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1.5">
                      标题 <span className="text-rose-500">*</span>
                    </label>
                    <input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      maxLength={50}
                      placeholder="用一句话概括您的问题或建议"
                      className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 placeholder:text-slate-400 focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1.5">
                      详细描述 <span className="text-rose-500">*</span>
                    </label>
                    <textarea
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      maxLength={5000}
                      rows={5}
                      placeholder={
                        feedbackType === "bug"
                          ? "请描述复现步骤、期望行为与实际行为，如有报错信息请一并附上（至少 10 个字符）"
                          : "请详细描述您的想法、遇到的问题或改进建议（至少 10 个字符）"
                      }
                      className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 placeholder:text-slate-400 focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none transition-all resize-none"
                    />
                    <div className="text-right text-[10px] text-slate-400 font-semibold mt-1">
                      {content.length}/5000
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1.5">
                      联系方式
                    </label>
                    <input
                      value={contact}
                      onChange={(e) => setContact(e.target.value)}
                      placeholder="邮箱或手机号，方便我们与您沟通进展"
                      className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 placeholder:text-slate-400 focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none transition-all"
                    />
                    <p className="text-[10px] text-slate-400 font-semibold mt-1">
                      {user
                        ? "已为您自动填写登录账号信息"
                        : "未登录，填写的联系方式将用于反馈处理"}
                    </p>
                  </div>

                  <button
                    onClick={handleSubmitFeedback}
                    disabled={submitting}
                    className="w-full py-3 bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] text-white text-sm font-bold rounded-xl shadow-sm hover:shadow hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-60 disabled:hover:translate-y-0 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        正在提交...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        提交反馈
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* 联系官方 */}
              <div className="bg-white/80 backdrop-blur-xl rounded-[24px] shadow-xl border border-white/95 p-6 md:p-8">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shadow-sm text-white">
                    <Mail className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-extrabold text-slate-800">
                      联系官方
                    </h2>
                    <p className="text-xs text-slate-500 font-semibold mt-0.5">
                      商务合作、企业服务与紧急问题支持
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  <a
                    href="mailto:support@zhige-dockyard.com"
                    className="flex items-center gap-3 p-3.5 rounded-2xl border border-slate-200/70 hover:border-[#3182ce]/40 hover:bg-[#3182ce]/5 transition-all duration-200 group"
                  >
                    <div className="w-9 h-9 rounded-xl bg-blue-50 text-[#3182ce] flex items-center justify-center shrink-0">
                      <Mail className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-extrabold text-slate-800 group-hover:text-[#3182ce] transition-colors">
                        support@zhige-dockyard.com
                      </div>
                      <div className="text-[10px] text-slate-500 font-semibold mt-0.5">
                        官方邮箱 · 15 个工作日内回复
                      </div>
                    </div>
                  </a>
                  <a
                    href="https://zhige-dockyard.com"
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-3 p-3.5 rounded-2xl border border-slate-200/70 hover:border-[#3182ce]/40 hover:bg-[#3182ce]/5 transition-all duration-200 group"
                  >
                    <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                      <Globe className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-extrabold text-slate-800 group-hover:text-[#3182ce] transition-colors">
                        https://zhige-dockyard.com
                      </div>
                      <div className="text-[10px] text-slate-500 font-semibold mt-0.5">
                        官方网站 · 了解产品与商务合作
                      </div>
                    </div>
                  </a>
                </div>

                <div className="mt-4 p-4 rounded-2xl bg-gradient-to-r from-[#3182ce]/5 to-[#10b981]/5 border border-slate-100">
                  <p className="text-[11px] text-slate-600 font-semibold leading-relaxed">
                    如需企业私有化部署、专属组件定制或驻场技术支持，欢迎通过官方邮箱联系我们的专家团队。
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
