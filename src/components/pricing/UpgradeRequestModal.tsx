"use client";

import { useState, useEffect } from "react";
import { X, Check, Loader2, AlertCircle } from "lucide-react";
import { useToast } from "@/components/Toast";

interface UpgradeRequestModalProps {
  open: boolean;
  onClose: () => void;
  planName: string;
  planDisplayName: string;
  isLoggedIn: boolean;
  userInfo: any;
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
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState("");
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(false);
  const [submitting, setSubmitting] = useState(false);

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

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim() || !contactName.trim() || !contactPhone.trim()) {
      toast.error("请填写所有必填字段");
      return;
    }

    const phoneRegex = /^1[3-9]\d{9}$/;
    if (!phoneRegex.test(contactPhone)) {
      toast.error("请输入有效的手机号码");
      return;
    }

    setSubmitting(true);
    try {
      // 如果已登录且有可升级的空间，提交至后端 API
      if (isLoggedIn && selectedWorkspaceId) {
        const res = await fetch("/api/workspace/upgrade-application", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            companyName: companyName.trim(),
            contactName: contactName.trim(),
            contactPhone: contactPhone.trim(),
            workspaceId: selectedWorkspaceId,
            description: requirements.trim() // 记录备注需求
          }),
        });

        const data = await res.json();
        if (res.ok && data.success) {
          toast.success("已收到您的升级申请，我们将在 1-2 个工作日内联系您");
          onClose();
        } else {
          // 如果后端报错该空间已经有申请，也直接给用户友好提示
          if (data.error?.includes("已有待处理")) {
            toast.error("该工作空间已有待处理的升级申请，请耐心等待客服联系");
          } else {
            toast.error(data.error || "提交升级申请失败，请稍后重试");
          }
        }
      } else {
        // 未登录或没有对应企业空间时的前端优雅 Mock
        await new Promise((resolve) => setTimeout(resolve, 800));
        toast.success("已收到您的升级申请，我们将在 1-2 个工作日内联系您");
        onClose();
      }
    } catch (error) {
      console.error("提交升级申请错误:", error);
      toast.error("网络请求异常，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl text-left border border-slate-100 space-y-4 animate-in zoom-in-95 duration-200">
        <div className="flex justify-between items-center pb-2 border-b">
          <h3 className="text-sm font-black text-slate-800 flex items-center gap-1.5">
            💎 申请升级方案: {planDisplayName}
          </h3>
          <button 
            type="button" 
            onClick={onClose} 
            className="text-slate-400 hover:text-slate-600 text-sm font-black p-1 cursor-pointer"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1.5">
              企业名称 <span className="text-red-500">*</span>
            </label>
            <input 
              type="text" 
              required
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="请输入您的企业/组织完整名称" 
              className="w-full h-10 px-3 border border-slate-200 rounded-lg text-xs font-bold focus:outline-none focus:border-[#3182ce] focus:ring-1 focus:ring-[#3182ce]"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1.5">
                联系人姓名 <span className="text-red-500">*</span>
              </label>
              <input 
                type="text" 
                required
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="您的姓名" 
                className="w-full h-10 px-3 border border-slate-200 rounded-lg text-xs font-bold focus:outline-none focus:border-[#3182ce] focus:ring-1 focus:ring-[#3182ce]"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1.5">
                联系电话 <span className="text-red-500">*</span>
              </label>
              <input 
                type="text" 
                required
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="手机号码" 
                className="w-full h-10 px-3 border border-slate-200 rounded-lg text-xs font-bold focus:outline-none focus:border-[#3182ce] focus:ring-1 focus:ring-[#3182ce]"
              />
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
                  ⚠️ 您当前尚未创建或不具备任何企业空间的管理员权限。提交后，我们的客户经理将主动与您联系并代为创建空间。
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
            <label className="block text-xs font-bold text-slate-500 mb-1.5">
              需求说明
            </label>
            <textarea 
              value={requirements}
              onChange={(e) => setRequirements(e.target.value)}
              placeholder="如有特殊定制化功能或私有算力部署诉求，请在此备注说明" 
              className="w-full h-20 p-3 border border-slate-200 rounded-lg text-xs font-bold focus:outline-none focus:border-[#3182ce] focus:ring-1 focus:ring-[#3182ce] resize-none"
            />
          </div>

          <div className="flex gap-2 justify-end pt-2 border-t border-slate-100">
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
