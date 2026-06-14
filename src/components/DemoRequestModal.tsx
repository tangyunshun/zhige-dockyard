"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useToast } from "@/components/Toast";
import { X, CheckCircle2, Zap, Building2, User, Mail, Phone, MessageSquare } from "lucide-react";

interface DemoRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function DemoRequestModal({ isOpen, onClose }: DemoRequestModalProps) {
  const toast = useToast();
  const [isVisible, setIsVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [mounted, setMounted] = useState(false);
  
  // 身份类型: 企业用户 or 个人开发者
  const [userType, setUserType] = useState<"enterprise" | "personal">("enterprise");

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    company: "",
    phone: "",
    requirements: "",
  });

  const [errors, setErrors] = useState({
    name: "",
    email: "",
    company: "",
  });

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      setSuccess(false);
      setUserType("enterprise");
      setFormData({
        name: "",
        email: "",
        company: "",
        phone: "",
        requirements: "",
      });
      setErrors({
        name: "",
        email: "",
        company: "",
      });
      document.body.style.overflow = "hidden";
    } else {
      const timer = setTimeout(() => setIsVisible(false), 300);
      document.body.style.overflow = "unset";
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!mounted) return null;
  if (!isVisible && !isOpen) return null;

  const validate = () => {
    const newErrors = { name: "", email: "", company: "" };
    let isValid = true;

    if (!formData.name.trim()) {
      newErrors.name = "请填写姓名";
      isValid = false;
    }
    
    // 只有企业用户强制校验公司名称
    if (userType === "enterprise" && !formData.company.trim()) {
      newErrors.company = "请填写公司名称";
      isValid = false;
    }

    const emailTrimmed = formData.email.trim();
    if (!emailTrimmed) {
      newErrors.email = userType === "enterprise" ? "请填写企业邮箱" : "请填写个人邮箱";
      isValid = false;
    } else {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(emailTrimmed)) {
        newErrors.email = "请输入有效的邮箱地址";
        isValid = false;
      }
    }

    setErrors(newErrors);
    return isValid;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name as keyof typeof errors]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    
    // 如果是个人用户且公司名称未填，后台要求必填字段，我们前台智能填充“个人开发”
    const finalCompany = userType === "personal" && !formData.company.trim() 
      ? "个人开发" 
      : formData.company;

    const payload = {
      ...formData,
      company: finalCompany
    };

    try {
      const res = await fetch("/api/demo-request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setSuccess(true);
        toast.success("演示申请提交成功！专属顾问将尽快联系您", 3000);
      } else {
        toast.error(data.error || "提交失败，请稍后重试", 3000);
      }
    } catch (err) {
      console.error("Submit demo request error:", err);
      toast.error("网络连接异常，请检查网络后重试", 3000);
    } finally {
      setSubmitting(false);
    }
  };

  return createPortal(
    <div
      className={`fixed inset-0 z-[1000] flex items-center justify-center transition-opacity duration-300 p-4 ${
        isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
      }`}
    >
      {/* 遮罩 */}
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity duration-300"
        onClick={onClose}
      />

      {/* 弹窗主体 */}
      <div
        className={`relative bg-white/95 backdrop-blur-md border border-white/90 rounded-[20px] shadow-2xl w-full max-w-[520px] max-h-[90vh] overflow-y-auto transform transition-all duration-300 ${
          isOpen ? "scale-100 translate-y-0" : "scale-95 translate-y-4"
        }`}
      >
        {/* 关闭按钮 */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1.5 hover:bg-slate-100 rounded-full transition-all z-10"
        >
          <X className="w-5 h-5" />
        </button>

        {!success ? (
          <form onSubmit={handleSubmit} className="p-8">
            <div className="mb-6">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 border border-blue-100 text-blue-600 text-xs font-bold mb-3">
                <Zap className="w-3.5 h-3.5 text-blue-500 animate-pulse" />
                免费试用 · 专属顾问 1v1
              </div>
              <h3 className="text-2xl font-bold text-slate-950">申请系统演示</h3>
              <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                请填写以下信息，我们的技术架构师将在24小时内为您安排系统演示与试用。
              </p>
            </div>

            {/* 身份切换选项卡 */}
            <div className="flex bg-slate-100 border border-slate-200/50 rounded-lg p-1 mb-5">
              <button
                type="button"
                onClick={() => {
                  setUserType("enterprise");
                  setErrors({ name: "", email: "", company: "" });
                }}
                className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all cursor-pointer ${
                  userType === "enterprise"
                    ? "bg-white text-[#3182ce] shadow-sm"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                企业用户
              </button>
              <button
                type="button"
                onClick={() => {
                  setUserType("personal");
                  setErrors({ name: "", email: "", company: "" });
                }}
                className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all cursor-pointer ${
                  userType === "personal"
                    ? "bg-white text-[#3182ce] shadow-sm"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                个人开发者
              </button>
            </div>

            <div className="space-y-4">
              {/* 姓名 */}
              <div>
                <label className="block text-xs font-bold text-slate-750 mb-1.5 zg-required">
                  姓名
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    placeholder="请输入您的姓名"
                    className={`zg-input pl-9 ${errors.name ? "is-error" : ""}`}
                  />
                </div>
                {errors.name && (
                  <p className="text-xs text-red-500 mt-1 font-medium">{errors.name}</p>
                )}
              </div>

              {/* 邮箱 */}
              <div>
                <label className="block text-xs font-bold text-slate-750 mb-1.5 zg-required">
                  {userType === "enterprise" ? "企业邮箱" : "个人邮箱"}
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder={userType === "enterprise" ? "name@company.com" : "yourname@example.com"}
                    className={`zg-input pl-9 ${errors.email ? "is-error" : ""}`}
                  />
                </div>
                {errors.email && (
                  <p className="text-xs text-red-500 mt-1 font-medium">{errors.email}</p>
                )}
              </div>

              {/* 公司名称 */}
              <div>
                <label className={`block text-xs font-bold text-slate-755 mb-1.5 ${userType === "enterprise" ? "zg-required" : ""}`}>
                  {userType === "enterprise" ? "公司名称" : "组织/学校/个人机构 (选填)"}
                </label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    name="company"
                    value={formData.company}
                    onChange={handleChange}
                    placeholder={userType === "enterprise" ? "请输入完整的企业/组织名称" : "学校、团队名或填写个人开发（选填）"}
                    className={`zg-input pl-9 ${errors.company ? "is-error" : ""}`}
                  />
                </div>
                {errors.company && (
                  <p className="text-xs text-red-500 mt-1 font-medium">{errors.company}</p>
                )}
              </div>

              {/* 联系电话 */}
              <div>
                <label className="block text-xs font-bold text-slate-755 mb-1.5">
                  联系电话
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    placeholder="请输入联系电话（选填）"
                    className="zg-input pl-9"
                  />
                </div>
              </div>

              {/* 业务需求 */}
              <div>
                <label className="block text-xs font-bold text-slate-755 mb-1.5">
                  主要用途/业务需求
                </label>
                <div className="relative">
                  <MessageSquare className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                  <textarea
                    name="requirements"
                    value={formData.requirements}
                    onChange={handleChange}
                    rows={3}
                    placeholder="例如：评估标书解析能力、微服务生成或者进行二次集成开发等（选填）"
                    className="zg-input pl-9 pt-2.5 h-auto resize-none"
                  />
                </div>
              </div>
            </div>

            <div className="mt-8 flex items-center justify-end gap-3 border-t border-slate-100 pt-6">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="zg-btn zg-btn-default px-6"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="zg-btn zg-btn-primary px-8"
              >
                {submitting ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></span>
                    提交中...
                  </>
                ) : (
                  "提交申请"
                )}
              </button>
            </div>
          </form>
        ) : (
          <div className="p-10 text-center flex flex-col items-center">
            <div className="w-16 h-16 rounded-full bg-emerald-50 border-4 border-emerald-100 flex items-center justify-center text-emerald-500 mb-5 shadow-inner">
              <CheckCircle2 className="w-9 h-9" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-2">申请已成功提交！</h3>
            <p className="text-sm text-slate-500 max-w-sm leading-relaxed mb-8">
              感谢您对知阁·舟坊的关注。专属顾问将分析您的需求，并尽快通过电话或邮件与您取得联系。
            </p>
            <button
              onClick={onClose}
              className="zg-btn zg-btn-primary w-full max-w-[200px]"
            >
              我知道了
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
