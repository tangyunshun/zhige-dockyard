"use client";

import { ClipboardList, ArrowLeft, Search, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";

export default function OrdersPage() {
  const router = useRouter();

  return (
    <div className="p-6 space-y-6">
      {/* 头部面包屑与返回 */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-2">
            <ClipboardList className="w-8 h-8 text-blue-500" />
            订单管理
          </h1>
          <p className="text-sm text-slate-400 font-semibold mt-1">
            查看并维护所有工作空间的服务点数购买与等级升级支付账单
          </p>
        </div>
        <button
          onClick={() => router.push("/admin")}
          className="h-10 px-4 bg-slate-100 hover:bg-slate-200/80 text-slate-700 text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5"
        >
          <ArrowLeft className="w-4 h-4" />
          返回大盘
        </button>
      </div>

      {/* 搜索与过滤栏 */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <input
            type="text"
            placeholder="搜索订单 ID / 用户 ID / 空间..."
            className="w-full h-10 pl-9 pr-4 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium focus:bg-white focus:border-blue-500 outline-none transition-all"
          />
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <select className="h-10 px-3 bg-slate-550 border border-slate-200 rounded-lg text-xs font-bold outline-none cursor-pointer">
            <option>全部支付状态</option>
            <option>支付成功</option>
            <option>待支付</option>
            <option>已关闭</option>
            <option>已退款</option>
          </select>
          <button className="h-10 px-4 bg-blue-500 hover:bg-blue-600 text-white text-xs font-bold rounded-lg shadow-sm hover:shadow transition-all flex items-center gap-1">
            <RefreshCw className="w-3.5 h-3.5" />
            刷新
          </button>
        </div>
      </div>

      {/* 订单列表占位 */}
      <div className="bg-white/80 border border-slate-200 rounded-2xl shadow-sm overflow-hidden min-h-[300px] flex items-center justify-center p-8 text-center">
        <div className="max-w-sm space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-blue-50/50 flex items-center justify-center mx-auto text-blue-500 shadow-inner">
            <ClipboardList className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-800">暂无关联支付账单</h3>
            <p className="text-xs font-semibold text-slate-400 mt-1.5 leading-relaxed">
              当前平台下尚未产生真实的流水记录。<br />当普通用户在控制台发起额度升级并调用沙箱/真实支付网关时，此处将同步自动捕获并记入。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
