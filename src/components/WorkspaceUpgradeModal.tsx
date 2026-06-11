"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { X, CheckCircle, AlertTriangle, ArrowRight, Building } from "lucide-react";

interface WorkspaceUpgradeModalProps {
  onClose: () => void;
  workspaceId: string;
  workspaceName: string;
}

type UpgradeOption = "migrate" | "new" | null;

export default function WorkspaceUpgradeModal({ 
  onClose, 
  workspaceId, 
  workspaceName 
}: WorkspaceUpgradeModalProps) {
  const router = useRouter();
  const toast = useToast();
  const [selectedOption, setSelectedOption] = useState<UpgradeOption>(null);
  const [confirmText, setConfirmText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [step, setStep] = useState<"select" | "confirm">("select");

  // 模拟检查配额
  const checkSpaceQuota = async (): Promise<{ canUpgrade: boolean; message?: string }> => {
    try {
      const res = await fetch("/api/user/workspace-hub/quota");
      if (res.ok) {
        const data = await res.json();
        if (!data.isVip) {
          return { 
            canUpgrade: false, 
            message: "您当前为免费社区版，无法创建企业协作空间。请开通 VIP 获取企业空间额度。" 
          };
        }
        if (data.ownedEnterpriseCount >= data.maxEnterpriseLimit) {
          return { 
            canUpgrade: false, 
            message: `您的企业空间额度已达上限 (${data.maxEnterpriseLimit}个)，请升级至更高版本。` 
          };
        }
        return { canUpgrade: true };
      }
      return { canUpgrade: false, message: "检查配额失败，请稍后再试" };
    } catch (error) {
      return { canUpgrade: false, message: "检查配额失败，请稍后再试" };
    }
  };

  const handleOptionSelect = (option: UpgradeOption) => {
    setSelectedOption(option);
  };

  const handleContinue = async () => {
    // 前置校验
    const quotaCheck = await checkSpaceQuota();
    if (!quotaCheck.canUpgrade) {
      toast.error(quotaCheck.message || "检查配额失败，请稍后再试");
      return;
    }

    if (selectedOption === "migrate") {
      // 数据平移需要二次确认
      setStep("confirm");
    } else if (selectedOption === "new") {
      // 隔离新建直接执行
      handleUpgrade("new");
    }
  };

  const handleUpgrade = async (type: "migrate" | "new") => {
    try {
      setIsProcessing(true);
      
      // 模拟 API 调用
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      toast.success("升级成功！正在跳转...");
      
      // 关闭弹窗
      onClose();
      
      // 延迟跳转，让用户看到成功提示
      setTimeout(() => {
        router.push("/workspace-hub");
      }, 1000);
    } catch (error) {
      toast.error("升级失败，请稍后再试");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmUpgrade = () => {
    if (confirmText !== "CONFIRM") {
      toast.error("请输入 CONFIRM 以确认");
      return;
    }
    handleUpgrade("migrate");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-[8px] shadow-lg shadow-slate-200/50 max-w-2xl w-full relative">
        {/* 关闭按钮 */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 transition-all"
        >
          <X className="w-4 h-4 text-slate-500" />
        </button>

        <div className="p-8">
          {/* 头部 */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-[8px] bg-gradient-to-br from-[#f59e0b] to-[#d97706] flex items-center justify-center mx-auto mb-4">
              <Building className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-2xl font-black text-slate-800 mb-2">
              升级为企业协作版
            </h2>
            <p className="text-sm text-slate-600">
              {step === "select" 
                ? "选择升级方式，将当前个人空间升级为企业协作空间"
                : "请确认数据迁移操作"
              }
            </p>
          </div>

          {step === "select" ? (
            <>
              {/* 选项卡片 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                {/* 选项 A：数据平移 */}
                <button
                  onClick={() => handleOptionSelect("migrate")}
                  className={`text-left p-6 rounded-[8px] border-2 transition-all duration-200 ease-out ${
                    selectedOption === "migrate"
                      ? "border-[#2b6cb0] bg-[#2b6cb0]/5"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      selectedOption === "migrate" 
                        ? "bg-[#2b6cb0] text-white" 
                        : "bg-slate-200 text-slate-500"
                    }`}>
                      {selectedOption === "migrate" ? (
                        <CheckCircle className="w-4 h-4" />
                      ) : (
                        <span className="text-sm font-bold">1</span>
                      )}
                    </div>
                    <h3 className="font-bold text-slate-800">数据平移</h3>
                  </div>
                  <p className="text-sm text-slate-600">
                    将当前个人空间内所有资产（标书、PRD、代码等）全量迁移至新企业空间。
                    迁移后原个人空间将被注销，空间转为企业协作模式。
                  </p>
                </button>

                {/* 选项 B：隔离新建 */}
                <button
                  onClick={() => handleOptionSelect("new")}
                  className={`text-left p-6 rounded-[8px] border-2 transition-all duration-200 ease-out ${
                    selectedOption === "new"
                      ? "border-[#2b6cb0] bg-[#2b6cb0]/5"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      selectedOption === "new" 
                        ? "bg-[#2b6cb0] text-white" 
                        : "bg-slate-200 text-slate-500"
                    }`}>
                      {selectedOption === "new" ? (
                        <CheckCircle className="w-4 h-4" />
                      ) : (
                        <span className="text-sm font-bold">2</span>
                      )}
                    </div>
                    <h3 className="font-bold text-slate-800">隔离新建</h3>
                  </div>
                  <p className="text-sm text-slate-600">
                    保留当前个人空间及数据。消耗 1 个企业空间额度，
                    为您初始化一个纯净的企业协作环境。
                  </p>
                </button>
              </div>

              {/* 按钮 */}
              <div className="flex items-center gap-3">
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-3 bg-white border border-slate-200 text-slate-700 text-sm font-bold rounded-[4px] hover:bg-slate-50 transition-all"
                  disabled={isProcessing}
                >
                  取消
                </button>
                <button
                  onClick={handleContinue}
                  disabled={!selectedOption || isProcessing}
                  className="flex-1 px-4 py-3 bg-gradient-to-r from-[#2b6cb0] to-[#3182ce] text-white text-sm font-bold rounded-[4px] hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isProcessing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>处理中...</span>
                    </>
                  ) : (
                    <>
                      <span>继续</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </>
          ) : (
            <>
              {/* 确认页面 */}
              <div className="mb-8">
                <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-[8px]">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-bold text-amber-800 mb-1">数据迁移警告</h4>
                      <p className="text-sm text-amber-700">
                        此操作将永久删除您的个人空间并将数据迁移到新的企业空间。
                        此操作不可逆，请谨慎操作。
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mb-6">
                  <label className="block text-sm font-bold text-slate-700 mb-2">
                    请输入 <span className="text-[#2b6cb0] font-black">CONFIRM</span> 以确认
                  </label>
                  <input
                    type="text"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder="输入 CONFIRM"
                    className="w-full px-4 py-3 border-2 border-slate-200 rounded-[8px] focus:border-[#2b6cb0] focus:ring-2 focus:ring-[#2b6cb0]/20 outline-none transition-all text-center text-lg font-mono tracking-widest uppercase"
                    disabled={isProcessing}
                  />
                </div>
              </div>

              {/* 按钮 */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setStep("select")}
                  className="flex-1 px-4 py-3 bg-white border border-slate-200 text-slate-700 text-sm font-bold rounded-[4px] hover:bg-slate-50 transition-all"
                  disabled={isProcessing}
                >
                  返回
                </button>
                <button
                  onClick={handleConfirmUpgrade}
                  disabled={confirmText !== "CONFIRM" || isProcessing}
                  className="flex-1 px-4 py-3 bg-gradient-to-r from-[#f59e0b] to-[#d97706] text-white text-sm font-bold rounded-[4px] hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isProcessing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>迁移中...</span>
                    </>
                  ) : (
                    <span>确认迁移</span>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
