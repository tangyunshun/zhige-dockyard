"use client";

export default function AdminContentPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 mb-2">内容管理</h1>
        <p className="text-sm text-slate-500">组件审核、文档管理、公告发布</p>
      </div>

      {/* 占位内容 */}
      <div className="bg-white rounded-xl p-12 border border-slate-200 shadow-sm text-center">
        <div className="w-20 h-20 bg-gradient-to-br from-[#f59e0b] to-[#d97706] rounded-2xl flex items-center justify-center mx-auto mb-6">
          <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-slate-800 mb-2">内容管理</h2>
        <p className="text-slate-500 mb-6">此功能模块正在开发中，即将上线</p>
        <p className="text-sm text-slate-400">功能包括：组件审核、文档管理、公告发布等</p>
      </div>
    </div>
  );
}
