"use client";

export default function AdminWorkspacesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 mb-2">工作空间管理</h1>
        <p className="text-sm text-slate-500">审核工作空间、管理资源配额</p>
      </div>

      {/* 占位内容 */}
      <div className="bg-white rounded-xl p-12 border border-slate-200 shadow-sm text-center">
        <div className="w-20 h-20 bg-gradient-to-br from-[#10b981] to-[#059669] rounded-2xl flex items-center justify-center mx-auto mb-6">
          <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-slate-800 mb-2">工作空间管理</h2>
        <p className="text-slate-500 mb-6">此功能模块正在开发中，即将上线</p>
        <p className="text-sm text-slate-400">功能包括：空间审核、资源配额管理、空间统计等</p>
      </div>
    </div>
  );
}
