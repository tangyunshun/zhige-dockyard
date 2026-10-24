"use client";

/**
 * RechargeModal —— 工作空间「算力点充值与分配」弹窗（展示层）
 *
 * 来源区块：WorkspaceInternalLayoutV3.tsx 的 {showRechargeModal && (...)} 整段 JSX（原约 392 行）
 * 拆分日期：2026-10-25（V3 拆分第 1 步）
 *
 * 本组件只做展示：所有状态（rechargeTab / offlineForm / poolThreshold* / recyclePoints 等）、
 * 状态修改函数（set*）与业务操作（handleExecuteRecharge / submitOfflineOrder /
 * handleSavePoolThreshold / handleExecuteRecycle）均由父组件 V3 通过 props 传入；
 * 本组件不持有任何 state、不发请求。关闭动作统一走 onClose。
 */

import { Zap, X } from "lucide-react";
import {
  pointsToYuan,
  formatYuanFromPoints,
  applyMemberDiscount,
  formatDiscountLabel,
} from "@/lib/point-rate";
import { isUnlimitedToken, formatTokenBalance } from "@/utils/quota";

type RechargeTab = "online" | "offline" | "recycle";
type PaymentMethod = "WECHAT_PAY" | "ALIPAY";

interface WorkspaceQuotaInfo {
  tokenBalance: number;
  levelName: string;
  levelTokenLimit: number;
  totalAllocatedToMembers: number;
  unallocatedBalance: number;
}

interface TokenPack {
  id?: string;
  points: number;
  name: string;
  price?: number;
  icon?: string;
  isPopular?: boolean;
  description?: string;
}

interface OfflineForm {
  points: string;
  invoiceTitle: string;
  taxNo: string;
  bankName: string;
  bankAccount: string;
  remark: string;
}

interface PoolThresholdInfo {
  effective: number;
  planDefault: number;
  isCustom: boolean;
}

export interface RechargeModalProps {
  onClose: () => void;
  rechargeTab: RechargeTab;
  setRechargeTab: (v: RechargeTab) => void;
  workspaceType: "PERSONAL" | "ENTERPRISE";
  userRole: string;
  workspaceQuotaInfo: WorkspaceQuotaInfo;
  availableTokenForUser: number;
  dynamicTokenPacks: TokenPack[];
  selectedRechargePack: { id?: string; points: number; name: string; price?: number };
  setSelectedRechargePack: (v: { id?: string; points: number; name: string; price?: number }) => void;
  rechargeMemberDiscount: number;
  rechargePaymentMethod: PaymentMethod;
  setRechargePaymentMethod: (v: PaymentMethod) => void;
  recharging: boolean;
  handleExecuteRecharge: () => void;
  offlineForm: OfflineForm;
  setOfflineForm: (v: OfflineForm) => void;
  offlineResultOrderNo: string | null;
  submitOfflineOrder: () => void;
  submittingOffline: boolean;
  poolThresholdInfo: PoolThresholdInfo | null;
  poolThresholdInput: string;
  setPoolThresholdInput: (v: string) => void;
  poolThresholdSaving: boolean;
  handleSavePoolThreshold: () => void;
  recycling: boolean;
  recyclePoints: string;
  setRecyclePoints: (v: string) => void;
  handleExecuteRecycle: () => void;
}

export default function RechargeModal(props: RechargeModalProps) {
  const {
    onClose,
    rechargeTab,
    setRechargeTab,
    workspaceType,
    userRole,
    workspaceQuotaInfo,
    availableTokenForUser,
    dynamicTokenPacks,
    selectedRechargePack,
    setSelectedRechargePack,
    rechargeMemberDiscount,
    rechargePaymentMethod,
    setRechargePaymentMethod,
    recharging,
    handleExecuteRecharge,
    offlineForm,
    setOfflineForm,
    offlineResultOrderNo,
    submitOfflineOrder,
    submittingOffline,
    poolThresholdInfo,
    poolThresholdInput,
    setPoolThresholdInput,
    poolThresholdSaving,
    handleSavePoolThreshold,
    recycling,
    recyclePoints,
    setRecyclePoints,
    handleExecuteRecycle,
  } = props;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-md w-full max-h-[92vh] flex flex-col p-6 shadow-2xl border border-white/90 space-y-4 animate-in zoom-in-95 duration-200 overflow-y-auto">
        {/* Header 保持吸顶 */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3.5 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900">算力点充值与分配</h3>
              <p className="text-xs text-slate-500 font-medium">提升当前工作空间的服务算力额度</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 充值方式 Tab：在线充值 / 对公转账工单 */}
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1 shrink-0">
          <button
            type="button"
            onClick={() => setRechargeTab("online")}
            className={`flex-1 py-2 rounded-lg text-xs font-black transition-all cursor-pointer ${
              rechargeTab === "online"
                ? "bg-white shadow-sm text-[#3182ce]"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            在线充值
          </button>
          <button
            type="button"
            onClick={() => setRechargeTab("offline")}
            className={`flex-1 py-2 rounded-lg text-xs font-black transition-all cursor-pointer ${
              rechargeTab === "offline"
                ? "bg-white shadow-sm text-[#3182ce]"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            对公转账 / 合同
          </button>
          {workspaceType === "ENTERPRISE" && (userRole === "Owner" || userRole === "Admin" || userRole === "OWNER" || userRole === "ADMIN") && (
            <button
              type="button"
              onClick={() => setRechargeTab("recycle")}
              className={`flex-1 py-2 rounded-lg text-xs font-black transition-all cursor-pointer ${
                rechargeTab === "recycle"
                  ? "bg-white shadow-sm text-[#3182ce]"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              回收至个人钱包
            </button>
          )}
        </div>

        {/* 极致压缩高度的配额提示卡片 */}
        <div className="bg-amber-50/90 p-3.5 rounded-2xl border border-amber-200/90 space-y-2 text-xs text-amber-900 shrink-0">
          <div className="font-black text-sm flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span>⚡ 当前算力账户配额:</span>
              <span className="font-mono text-amber-950 font-black">
                {formatTokenBalance(isUnlimitedToken(workspaceQuotaInfo.tokenBalance) ? -1 : (workspaceQuotaInfo.tokenBalance ?? availableTokenForUser ?? 0))} 算力点
              </span>
            </div>
            <span className="font-mono text-amber-800 text-xs font-bold bg-amber-100/80 px-2 py-0.5 rounded-md shrink-0 whitespace-nowrap">
              {!isUnlimitedToken(workspaceQuotaInfo.tokenBalance) && `折合 ${formatYuanFromPoints(workspaceQuotaInfo.tokenBalance ?? availableTokenForUser ?? 0)}`}
            </span>
          </div>

          <div className="text-[11px] font-bold text-amber-800 bg-amber-100/80 border border-amber-200/60 rounded-xl px-2.5 py-1.5 flex items-center gap-1 shrink-0 overflow-x-auto no-scrollbar whitespace-nowrap">
            <span className="shrink-0">💡 换算规则:</span>
            <span className="font-mono text-amber-900 font-bold whitespace-nowrap">10 算力点 = 0.1 元为参考价；算力包按档位享体积折扣，高级会员另享专属折扣</span>
          </div>
        </div>

        {/* 固定的标题文字，放在 overflow 滚动区的外面，彻底消除遮挡叠字 */}
        {rechargeTab === "online" && (
        <>
        <label className="block text-xs font-black text-slate-700 shrink-0 pt-1">
          请选择所需申购的算力包：
        </label>

        {/* 算力包选择列表 纯卡片垂直滚动 */}
        <div className="flex-1 min-h-[160px] max-h-[34vh] overflow-y-auto pr-1.5 space-y-3">
          <div className="grid grid-cols-1 gap-3">
            {dynamicTokenPacks.length > 0 ? dynamicTokenPacks.map((pack) => {
              const isSelected = selectedRechargePack.id
                ? selectedRechargePack.id === pack.id
                : selectedRechargePack.points === pack.points;
              const originalPrice = Number(pack.price ?? pointsToYuan(pack.points));
              const memberPrice =
                rechargeMemberDiscount > 0 ? applyMemberDiscount(originalPrice, rechargeMemberDiscount) : originalPrice;
              const hasMemberDeal = rechargeMemberDiscount > 0 && memberPrice < originalPrice;
              const memberDealLabel = formatDiscountLabel(rechargeMemberDiscount);
              return (
                <div
                  key={pack.id}
                  onClick={() => setSelectedRechargePack({ id: pack.id, points: pack.points, name: `${pack.name} (${pack.points.toLocaleString()} 算力点)`, price: pack.price })}
                  className={`p-4 rounded-2xl border text-xs cursor-pointer transition-all relative ${
                    isSelected
                      ? "bg-blue-50/80 border-[#3182ce] ring-2 ring-[#3182ce]/20 text-[#3182ce]"
                      : "bg-slate-50 border-slate-200 text-slate-700 hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className={`w-4 h-4 rounded-full border flex items-center justify-center text-[10px] shrink-0 mt-0.5 ${
                      isSelected ? "border-[#3182ce] bg-[#3182ce] text-white" : "border-slate-300"
                    }`}>
                      {isSelected ? "✓" : ""}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 flex-wrap font-black text-[13px]">
                          <span>{pack.icon || "⚡"}</span>
                          <span>{pack.name}</span>
                          <span className="text-slate-500 font-medium">({pack.points.toLocaleString()} 算力点)</span>
                          {pack.isPopular && (
                            <span className="px-1.5 py-0.5 bg-amber-100 text-amber-800 text-[9px] rounded font-black">热门</span>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          {hasMemberDeal && (
                            <div className="text-[10px] font-bold text-slate-400 line-through">
                              ¥{originalPrice.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                          )}
                          <div className="font-mono text-sm font-black">
                            ¥{memberPrice.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                          {hasMemberDeal && memberDealLabel && (
                            <div className="mt-0.5 text-[9px] font-black bg-rose-50 text-rose-500 px-1 py-0.5 rounded w-fit ml-auto">
                              会员 {memberDealLabel}
                            </div>
                          )}
                        </div>
                      </div>
                      {pack.description && (
                        <p className="text-[11px] text-slate-500 font-medium mt-1.5 leading-relaxed">
                          {pack.description}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            }                ) : (
              <div className="col-span-1 p-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 text-center space-y-2">
                <p className="text-xs font-bold text-slate-600">暂无可购算力包，请联系管理员在后台配置</p>
                <p className="text-[11px] text-slate-400 font-medium">算力包由平台管理员统一配置，个人无法自行添加</p>
              </div>
            )}
          </div>
        </div>

        {/* 支付方式选择 */}
        <div className="shrink-0 space-y-2">
          <label className="block text-xs font-black text-slate-700">选择支付方式：</label>
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => setRechargePaymentMethod("WECHAT_PAY")}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${rechargePaymentMethod === "WECHAT_PAY"
                ? "border-[#3182ce] bg-blue-50/80 ring-2 ring-[#3182ce]/20 text-[#2b6cb0]"
                : "border-slate-200 bg-white hover:border-slate-300 text-slate-700"
                }`}
            >
              <img src="/icons/wechat-pay.png" alt="" className="w-5 h-5 object-contain shrink-0" />
              <span>微信支付</span>
            </button>
            <button
              type="button"
              onClick={() => setRechargePaymentMethod("ALIPAY")}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${rechargePaymentMethod === "ALIPAY"
                ? "border-[#3182ce] bg-blue-50/80 ring-2 ring-[#3182ce]/20 text-[#2b6cb0]"
                : "border-slate-200 bg-white hover:border-slate-300 text-slate-700"
                }`}
            >
              <img src="/icons/alipay.png" alt="" className="w-5 h-5 object-contain shrink-0" />
              <span>支付宝</span>
            </button>
          </div>
        </div>

        {/* 底部按钮区 保持吸底：仅保留取消与确认，充值记录在空间算力点页查看 */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 whitespace-nowrap px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition-all cursor-pointer"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleExecuteRecharge}
              disabled={recharging}
              className="shrink-0 whitespace-nowrap px-5 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-black rounded-xl text-xs shadow-md transition-all cursor-pointer active:scale-95 disabled:opacity-50"
            >
              {recharging
                ? "正在划拨算力..."
                : `立即充值（${selectedRechargePack.points.toLocaleString()} 算力点 / ¥${applyMemberDiscount(selectedRechargePack.price ?? pointsToYuan(selectedRechargePack.points), rechargeMemberDiscount).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}）`}
            </button>
        </div>
      </>
      )}
      {rechargeTab === "offline" && (
        <div className="shrink-0 space-y-3 border-t border-slate-100 pt-3">
          <div className="bg-blue-50/80 border border-blue-200 rounded-xl px-3 py-2 text-[11px] font-bold text-blue-800 leading-relaxed">
            对公转账 / 合同结算：提交后将生成充值工单，由平台管理员审批并通过后自动入账至本空间对应算力账户。请按提示完成对公打款并准确回填凭证信息，便于财务对账。
          </div>
          <div>
            <label className="block text-xs font-black text-slate-700 mb-1">
              充值算力点数 <span className="text-red-500">*</span>
            </label>
            <input
              type="number" min="1"
              value={offlineForm.points}
              onChange={(e) => setOfflineForm({ ...offlineForm, points: e.target.value })}
              placeholder="例如 10000"
              className="w-full h-9 px-3 text-xs border border-slate-200 rounded-lg focus:border-[#3182ce] outline-none font-mono"
            />
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-xs font-black text-slate-700 mb-1">发票抬头</label>
              <input
                value={offlineForm.invoiceTitle}
                onChange={(e) => setOfflineForm({ ...offlineForm, invoiceTitle: e.target.value })}
                placeholder="单位名称"
                className="w-full h-9 px-3 text-xs border border-slate-200 rounded-lg focus:border-[#3182ce] outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-black text-slate-700 mb-1">税号</label>
              <input
                value={offlineForm.taxNo}
                onChange={(e) => setOfflineForm({ ...offlineForm, taxNo: e.target.value })}
                placeholder="纳税人识别号"
                className="w-full h-9 px-3 text-xs border border-slate-200 rounded-lg focus:border-[#3182ce] outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-black text-slate-700 mb-1">开户银行</label>
              <input
                value={offlineForm.bankName}
                onChange={(e) => setOfflineForm({ ...offlineForm, bankName: e.target.value })}
                placeholder="如：招商银行XX支行"
                className="w-full h-9 px-3 text-xs border border-slate-200 rounded-lg focus:border-[#3182ce] outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-black text-slate-700 mb-1">银行账号</label>
              <input
                value={offlineForm.bankAccount}
                onChange={(e) => setOfflineForm({ ...offlineForm, bankAccount: e.target.value })}
                placeholder="对公账号"
                className="w-full h-9 px-3 text-xs border border-slate-200 rounded-lg focus:border-[#3182ce] outline-none font-mono"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-black text-slate-700 mb-1">备注</label>
            <textarea
              value={offlineForm.remark}
              onChange={(e) => setOfflineForm({ ...offlineForm, remark: e.target.value })}
              placeholder="合同编号、付款用途等"
              rows={2}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:border-[#3182ce] outline-none resize-none"
            />
          </div>
          {offlineResultOrderNo ? (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 text-[11px] font-bold text-emerald-700">
              工单已提交，单号：{offlineResultOrderNo}。可在「我的算力」页面查看审批进度。
            </div>
          ) : (
            <div className="flex items-center justify-end gap-3 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition-all cursor-pointer"
              >
                取消
              </button>
              <button
                type="button"
                onClick={submitOfflineOrder}
                disabled={submittingOffline}
                className="px-5 py-2.5 bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] text-white font-black rounded-xl text-xs shadow-md transition-all cursor-pointer active:scale-95 disabled:opacity-50"
              >
                {submittingOffline ? "提交中..." : "提交充值工单"}
              </button>
            </div>
          )}
        </div>
      )}
      {rechargeTab === "recycle" && (
        <div className="shrink-0 space-y-3 border-t border-slate-100 pt-3">
          <div className="bg-blue-50/80 border border-blue-200 rounded-xl px-3 py-2 text-[11px] font-bold text-blue-800 leading-relaxed">
            将企业共享池的算力点回收至您的个人钱包。回收后点数进入个人钱包（跨空间通用），企业共享池余额相应减少。
          </div>
          <div className="bg-white border border-blue-200 rounded-xl px-3 py-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-[#2b6cb0]">企业池低余额预警阈值</span>
              {poolThresholdInfo && (
                <span className="text-[10px] font-bold text-[#3182ce]">
                  {poolThresholdInfo.isCustom ? "空间自定义" : `套餐默认 ${poolThresholdInfo.planDefault}`}
                </span>
              )}
            </div>
            <p className="text-[10px] text-slate-400 leading-relaxed">
              企业池余额低于该阈值时，自动提醒空间所有者补充算力点。留空则沿用套餐默认阈值。
            </p>
            <div className="flex items-center gap-2">
              <input
                type="number" min="0"
                value={poolThresholdInput}
                onChange={(e) => setPoolThresholdInput(e.target.value)}
                placeholder={`默认 ${poolThresholdInfo?.planDefault ?? ""}`}
                className="w-40 h-9 px-3 text-xs border border-blue-200 rounded-lg focus:border-[#3182ce] outline-none font-mono"
              />
              <button
                type="button"
                disabled={poolThresholdSaving}
                onClick={handleSavePoolThreshold}
                className="px-4 py-2 bg-[#3182ce] hover:bg-[#2b6cb0] text-white font-black rounded-lg text-xs shadow-sm transition-all cursor-pointer active:scale-95 disabled:opacity-50"
              >
                {poolThresholdSaving ? "保存中..." : "保存阈值"}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-black text-slate-700 mb-1">
              回收算力点数 <span className="text-red-500">*</span>
            </label>
            <input
              type="number" min="1"
              value={recyclePoints}
              onChange={(e) => setRecyclePoints(e.target.value)}
              placeholder="例如 1000"
              className="w-full h-9 px-3 text-xs border border-slate-200 rounded-lg focus:border-[#3182ce] outline-none font-mono"
            />
          </div>
          {(() => {
            // 限制提示（按钮后给出红字）：企业池为 0 或 输入金额超过可用余额时拦截
            const unlimited = availableTokenForUser === -1;
            const inputAmount = Math.floor(Number(recyclePoints));
            const noBalance = !unlimited && availableTokenForUser === 0;
            const overBalance = !unlimited && Number.isFinite(inputAmount) && inputAmount > 0 && inputAmount > availableTokenForUser;
            if (!noBalance && !overBalance) return null;
            return (
              <div className="text-[11px] text-red-500 font-bold flex items-center justify-end gap-1.5">
                ⚠️ {noBalance
                  ? "当前企业池余额为 0，暂无可回收算力点"
                  : `回收金额 ${inputAmount.toLocaleString()} 点超过当前企业池可用余额 ${availableTokenForUser.toLocaleString()} 点`}
              </div>
            );
          })()}
          <div className="flex items-center justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition-all cursor-pointer"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleExecuteRecycle}
              disabled={
                recycling ||
                (availableTokenForUser !== -1 &&
                  (availableTokenForUser === 0 ||
                    (Math.floor(Number(recyclePoints)) > 0 &&
                      Math.floor(Number(recyclePoints)) > availableTokenForUser)))
              }
              className="px-5 py-2.5 bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] text-white font-black rounded-xl text-xs shadow-md transition-all cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {recycling ? "回收中..." : "确认回收至个人钱包"}
            </button>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
