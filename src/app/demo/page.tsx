"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Mail, User, Building, Phone } from "lucide-react";

export default function DemoPage() {
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    company: "",
    phone: "",
    requirements: "",
  });

  useEffect(() => {
    checkLoginStatus();
  }, []);

  const checkLoginStatus = async () => {
    try {
      const res = await fetch("/api/auth/me");
      if (res.ok) {
        setIsLoggedIn(true);
      } else {
        // 未登录，跳转到登录页并携带回调参数
        router.push(`/auth/login?redirect=${encodeURIComponent("/demo")}`);
      }
    } catch (error) {
      router.push(`/auth/login?redirect=${encodeURIComponent("/demo")}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const response = await fetch("/api/demo-request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        alert("演示申请已提交！我们的架构师将在 24 小时内与您联系。");
        router.push("/workspace-hub");
      } else {
        alert("提交失败，请稍后重试。");
      }
    } catch (error) {
      console.error("提交失败:", error);
      alert("提交失败，请稍后重试。");
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center">
        <div className="text-slate-500">加载中...</div>
      </div>
    );
  }

  if (!isLoggedIn) {
    return null;
  }

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      {/* 顶部导航 */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-slate-600 hover:text-[#3182ce] transition-all cursor-pointer"
          >
            <div className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center transition-all">
              <ArrowLeft className="w-5 h-5" />
            </div>
            <span className="text-sm font-medium">返回</span>
          </button>
          <div className="h-6 w-px bg-slate-200"></div>
          <h1 className="text-lg font-bold text-slate-800">申请私有化演示</h1>
        </div>
      </header>

      {/* 主要内容 */}
      <main className="max-w-3xl mx-auto px-6 py-12">
        {/* 说明卡片 */}
        <div className="bg-gradient-to-br from-[#3182ce] to-[#2563eb] rounded-2xl p-8 mb-8 text-white shadow-xl">
          <h2 className="text-2xl font-bold mb-3">私有化部署演示申请</h2>
          <p className="text-blue-100 text-sm leading-relaxed">
            填写以下信息，我们的解决方案架构师将在 24 小时内与您联系，安排专属演示环境。
            演示环境将部署在您的私有基础设施中，完整展示所有功能。
          </p>
        </div>

        {/* 申请表单 */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* 姓名 */}
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">
              姓名 <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-lg focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 transition-all outline-none"
                placeholder="请输入您的姓名"
              />
            </div>
          </div>

          {/* 邮箱 */}
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">
              工作邮箱 <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                required
                className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-lg focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 transition-all outline-none"
                placeholder="name@company.com"
              />
            </div>
          </div>

          {/* 公司 */}
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">
              公司名称 <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Building className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                name="company"
                value={formData.company}
                onChange={handleChange}
                required
                className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-lg focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 transition-all outline-none"
                placeholder="请输入公司全称"
              />
            </div>
          </div>

          {/* 电话 */}
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">
              联系电话
            </label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-lg focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 transition-all outline-none"
                placeholder="请输入手机号码"
              />
            </div>
          </div>

          {/* 需求描述 */}
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">
              需求描述
            </label>
            <textarea
              name="requirements"
              value={formData.requirements}
              onChange={handleChange}
              rows={4}
              className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 transition-all outline-none resize-none"
              placeholder="请简要描述您的业务场景和核心需求（可选）"
            />
          </div>

          {/* 提交按钮 */}
          <button
            type="submit"
            className="w-full py-4 bg-gradient-to-r from-[#3182ce] to-[#2563eb] text-white font-bold rounded-lg shadow-lg hover:shadow-xl hover:scale-[1.02] transition-all cursor-pointer text-lg"
          >
            提交申请
          </button>

          {/* 提示信息 */}
          <p className="text-xs text-slate-500 text-center">
            提交后我们将通过邮件与您确认演示时间，并发送演示环境访问信息
          </p>
        </form>
      </main>
    </div>
  );
}
