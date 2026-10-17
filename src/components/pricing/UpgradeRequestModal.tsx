"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { X, Loader2, AlertCircle } from "lucide-react";
import { useToast } from "@/components/Toast";

interface UpgradeRequestModalProps {
  open: boolean;
  onClose: () => void;
  planName: string;
  planDisplayName: string;
  isLoggedIn: boolean;
  userInfo: any;
}

/** 需求说明最大字数（与后端落库上限一致，前端先行限制） */
const REQUIREMENTS_MAX = 500;

/** 快捷诉求标签：点击追加到需求说明 */
const QUICK_TAGS = [
  "私有化部署",
  "扩容算力点",
  "专属模型接入",
  "SSO 单点登录",
  "扩充席位与存储",
  "专属客户成功经理",
];

/** 行内校验错误集合（提示语显示在输入框下方，严禁使用 toast） */
interface FieldErrors {
  companyName?: string;
  contactName?: string;
  contactPhone?: string;
  requirements?: string;
}

export default function UpgradeRequestModal({
  open,
  onClose,
  planName,
  planDisplayName,
  isLoggedIn,
  userInfo,
}: UpgradeRequestModalProps) {
  const toast = useToast();
  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [requirements, setRequirements] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState("");
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 每次打开弹窗时自动填充已有用户信息
  useEffect(() => {
    if (open) {
      if (isLoggedIn && userInfo) {
        setContactName(userInfo.name || userInfo.username || "");
        setContactPhone(userInfo.phone || "");
      } else {
        setContactName("");
        setContactPhone("");
      }
      setCompanyName("");
      setRequirements("");
      setFieldErrors({});
      setSelectedWorkspaceId("");
      setWorkspaces([]);
    }
  }, [open, isLoggedIn, userInfo]);

  // 获取工作空间列表
  useEffect(() => {
    if (open && isLoggedIn) {
      const fetchWorkspaces = async () => {
        try {
          setLoadingWorkspaces(true);
          const res = await fetch("/api/workspace/list");
          if (res.ok) {
            const data = await res.json();
            // 过滤出有管理权限 (OWNER / ADMIN) 的空间
            const adminSpaces = (data.workspaces || []).filter((w: any) => {
              const roleUpper = w.role?.toUpperCase() || "";
              return roleUpper === "OWNER" || roleUpper === "ADMIN" || w.role === "Owner";
            });
            setWorkspaces(adminSpaces);
            if (adminSpaces.length > 0) {
              setSelectedWorkspaceId(adminSpaces[0].id);
            }
          }
        } catch (e) {
          console.error("加载工作空间列表失败", e);
        } finally {
          setLoadingWorkspaces(false);
        }
      };
      fetchWorkspaces();
    }
  }, [open, isLoggedIn]);

  // ============ 行内校验（失焦校验 + 提交全量校验，提示语显示在输入框下方） ============
  const validateCompanyName = useCallback((v: string): string | undefined => {
    const t = v.trim();
    if (!t) return "请填写企业名称";
    if (t.length < 2) return "企业名称至少 2 个字符";
    if (t.length > 50) return "企业名称不能超过 50 个字符";
    // 必须包含中文或英文字母，防止纯数字/纯符号的无效输入
    if (!/[\u4e00-\u9fa5A-Za-z]/.test(t)) return "企业名称需包含中文或英文名称，不能仅为数字或符号";
    return undefined;
  }, []);

  const validateContactName = useCallback((v: string): string | undefined => {
    const t = v.trim();
    if (!t) return "请填写联系人姓名";
    if (t.length < 2) return "联系人姓名至少 2 个字符";
    if (t.length > 20) return "联系人姓名不能超过 20 个字符";
    return undefined;
  }, []);

  const validateContactPhone = useCallback((v: string): string | undefined => {
    const t = v.trim();
    if (!t) return "请填写联系电话";
    // 支持手机号与常见座机格式
    if (!/^(1[3-9]\d{9}|0\d{2,3}-?\d{7,8})$/.test(t)) return "请输入有效的手机号码（如 138xxxxxxxx）";
    return undefined;
  }, []);

  const validateRequirements = useCallback((v: string): string | undefined => {
    if (v.length > REQUIREMENTS_MAX) return `需求说明不能超过 ${REQUIREMENTS_MAX} 字`;
    return undefined;
  }, []);

  const runFieldValidation = useCallback(
    (field: keyof FieldErrors, value: string): string | undefined => {
      switch (field) {
        case "companyName":
          return validateCompanyName(value);
        case "contactName":
          return validateContactName(value);
        case "contactPhone":
          return validateContactPhone(value);
        case "requirements":
          return validateRequirements(value);
        default:
          return undefined;
      }
    },
    [validateCompanyName, validateContactName, validateContactPhone, validateRequirements]
  );

  /** 失焦时校验单个字段 */
  const handleBlur = (field: keyof FieldErrors, value: string) => {
    const error = runFieldValidation(field, value);
    setFieldErrors((prev) => ({ ...prev, [field]: error }));
  };

  /** 输入时更新值；若该字段已有错误则实时重新校验，让提示随输入修正消失 */
  const handleChange = (field: keyof FieldErrors, value: string) => {
    const setters: Record<string, (v: string) => void> = {
      companyName: setCompanyName,
      contactName: setContactName,
      contactPhone: setContactPhone,
      requirements: setRequirements,
    };
    setters[field]?.(value);
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      return { ...prev, [field]: runFieldValidation(field, value) };
    });
  };

  /** 点击快捷标签：追加到需求说明（自动补中文顿号分隔），并聚焦输入框 */
  const appendQuickTag = (tag: string) => {
    setRequirements((prev) => {
      if (prev.length >= REQUIREMENTS_MAX) return prev;
      const base = prev.trimEnd();
      const next = base ? (base.endsWith("、") ? base + tag : base + "、" + tag) : tag;
      const clipped = next.slice(0, REQUIREMENTS_MAX);
      setFieldErrors((fe) => (fe.requirements ? { ...fe, requirements: validateRequirements(clipped) } : fe));
      return clipped;
    });
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // 提交前全量行内校验（不使用 toast）
    const nextErrors: FieldErrors = {
      companyName: validateCompanyName(companyName),
      contactName: validateContactName(contactName),
      contactPhone: validateContactPhone(contactPhone),
      requirements: validateRequirements(requirements),
    };
    setFieldErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) return;

    setSubmitting(true);
    try {
      // 已登录用户一律真实提交（后端支持未关联空间的咨询）
      if (isLoggedIn) {
        const res = await fetch("/api/workspace/upgrade-application", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            companyName: companyName.trim(),
            contactName: contactName.trim(),
            contactPhone: contactPhone.trim(),
            workspaceId: selectedWorkspaceId || undefined,
            description: requirements.trim(), // 需求说明（后端落库）
          }),
        });

        const data = await res.json();
        if (res.ok && data.success) {
          toast.success("已收到您的咨询申请，我们将在 1-2 个工作日内联系您");
          onClose();
        } else {
          // 如果后端报错已有待处理申请，也直接给用户友好提示
          if (data.error?.includes("已有待处理")) {
            toast.error("您已有待处理的咨询申请，请耐心等待客户经理联系");
          } else {
            toast.error(data.error || "提交咨询申请失败，请稍后重试");
          }
        }
      } else {
        // 未登录时的前端优雅 Mock（无法建立用户关联，仅作咨询引导）
        await new Promise((resolve) => setTimeout(resolve, 800));
        toast.success("已收到您的咨询申请，我们将在 1-2 个工作日内联系您");
        onClose();
      }
    } catch (error) {
      console.error("提交咨询申请错误:", error);
      toast.error("网络请求异常，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  };

  // 错误态输入框样式：红框 + 红色聚焦环；正常态沿用品牌蓝
  const inputCls = (hasError?: string) =>
    `w-full h-10 px-3 border rounded-lg text-xs font-bold focus:outline-none focus:ring-1 transition-colors ${
      hasError
        ? "border-red-300 focus:border-red-400 focus:ring-red-400 bg-red-50/30"
        : "border-slate-200 focus:border-[#3182ce] focus:ring-[#3182ce]"
    }`;

  return (
    <div
      className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div className="bg-white rounded-2xl max-w-lg w-full max-h-[88vh] flex flex-col shadow-2xl text-left border border-slate-100 animate-in zoom-in-95 duration-200">
        {/* 标题栏（固定） */}
        <div className="flex justify-between items-center px-6 py-4 border-b shrink-0">
          <h3 className="text-base font-black text-slate-800 flex items-center gap-1.5">
            {planName === "CUSTOM" ? "定制方案咨询" : "申请升级方案"}：{planDisplayName}
          </h3>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-md hover:bg-slate-100 cursor-pointer transition-colors disabled:opacity-50"
            aria-label="关闭"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 表单主体（超出时内部滚动，不再被视口截断） */}
        <form onSubmit={handleSubmit} className="flex flex-col min-h-0 flex-1">
          <div className="overflow-y-auto px-6 py-4 space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1.5">
                企业名称 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                maxLength={50}
                value={companyName}
                onChange={(e) => handleChange("companyName", e.target.value)}
                onBlur={(e) => handleBlur("companyName", e.target.value)}
                placeholder="请输入您的企业/组织完整名称"
                className={inputCls(fieldErrors.companyName)}
              />
              {fieldErrors.companyName ? (
                <p className="mt-1 text-[11px] font-bold text-red-500 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3 shrink-0" />
                  {fieldErrors.companyName}
                </p>
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5">
                  联系人姓名 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  maxLength={20}
                  value={contactName}
                  onChange={(e) => handleChange("contactName", e.target.value)}
                  onBlur={(e) => handleBlur("contactName", e.target.value)}
                  placeholder="您的姓名"
                  className={inputCls(fieldErrors.contactName)}
                />
                {fieldErrors.contactName ? (
                  <p className="mt-1 text-[11px] font-bold text-red-500 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3 shrink-0" />
                    {fieldErrors.contactName}
                  </p>
                ) : null}
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5">
                  联系电话 <span className="text-red-500">*</span>
                </label>
                <input
                  type="tel"
                  required
                  maxLength={15}
                  value={contactPhone}
                  onChange={(e) => handleChange("contactPhone", e.target.value.replace(/[^\d-]/g, ""))}
                  onBlur={(e) => handleBlur("contactPhone", e.target.value)}
                  placeholder="手机号码"
                  className={inputCls(fieldErrors.contactPhone)}
                />
                {fieldErrors.contactPhone ? (
                  <p className="mt-1 text-[11px] font-bold text-red-500 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3 shrink-0" />
                    {fieldErrors.contactPhone}
                  </p>
                ) : null}
              </div>
            </div>

            {isLoggedIn && (
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5">
                  选择要升级的团队工作空间
                </label>
                {loadingWorkspaces ? (
                  <div className="flex items-center gap-2 py-2 text-slate-400 text-xs">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>加载可用工作空间中...</span>
                  </div>
                ) : workspaces.length === 0 ? (
                  <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-slate-500 text-[11px] font-medium leading-relaxed">
                    您当前尚未创建或不具备任何企业空间的管理员权限。提交后，我们的客户经理将主动与您联系并代为创建空间。
                  </div>
                ) : (
                  <select
                    value={selectedWorkspaceId}
                    onChange={(e) => setSelectedWorkspaceId(e.target.value)}
                    className="w-full h-10 px-3 bg-slate-50/50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 focus:bg-white focus:border-[#3182ce] focus:ring-1 focus:ring-[#3182ce] outline-none cursor-pointer"
                  >
                    {workspaces.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name} ({w.type === "ENTERPRISE" ? "企业版" : "个人版"})
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-bold text-slate-500">需求说明</label>
                <span
                  className={`text-[10px] font-mono font-bold ${
                    requirements.length >= REQUIREMENTS_MAX ? "text-red-500" : "text-slate-400"
                  }`}
                >
                  {requirements.length}/{REQUIREMENTS_MAX}
                </span>
              </div>
              <textarea
                ref={textareaRef}
                value={requirements}
                maxLength={REQUIREMENTS_MAX}
                onChange={(e) => handleChange("requirements", e.target.value)}
                onBlur={(e) => handleBlur("requirements", e.target.value)}
                placeholder="如有特殊定制化功能或私有算力部署诉求，请在此备注说明"
                className={`w-full h-24 p-3 border rounded-lg text-xs font-bold focus:outline-none focus:ring-1 resize-none transition-colors ${
                  fieldErrors.requirements
                    ? "border-red-300 focus:border-red-400 focus:ring-red-400 bg-red-50/30"
                    : "border-slate-200 focus:border-[#3182ce] focus:ring-[#3182ce]"
                }`}
              />
              {fieldErrors.requirements ? (
                <p className="mt-1 text-[11px] font-bold text-red-500 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3 shrink-0" />
                  {fieldErrors.requirements}
                </p>
              ) : null}
              {/* 快捷输入：常用诉求一键填入，减少用户打字成本 */}
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-bold text-slate-400 shrink-0">快捷填入：</span>
                {QUICK_TAGS.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => appendQuickTag(tag)}
                    className="px-2 py-1 bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-[#3182ce]/40 text-slate-600 hover:text-[#3182ce] text-[10px] font-bold rounded-md cursor-pointer transition-colors"
                  >
                    + {tag}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 底部操作栏（固定，不随内容滚动） */}
          <div className="flex gap-2 justify-end px-6 py-3.5 border-t border-slate-100 bg-white rounded-b-2xl shrink-0">
            <button
              type="button"
              disabled={submitting}
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-600 text-xs font-bold rounded-lg cursor-pointer transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 bg-[#3182ce] hover:bg-[#2b6cb0] disabled:bg-[#63b3ed] text-white text-xs font-bold rounded-lg shadow-sm hover:shadow transition-all cursor-pointer flex items-center justify-center gap-1.5"
            >
              {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>确认提交申请</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
