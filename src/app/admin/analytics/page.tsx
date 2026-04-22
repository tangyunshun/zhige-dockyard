"use client";

export default function AdminAnalyticsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 mb-2">数据分析</h1>
        <p className="text-sm text-slate-500">用户行为分析、功能使用率、性能监控</p>
      </div>

      {/* 占位内容 */}
      <div className="bg-white rounded-xl p-12 border border-slate-200 shadow-sm text-center">
        <div className="w-20 h-20 bg-gradient-to-br from-[#8b5cf6] to-[#7c3aed] rounded-2xl flex items-center justify-center mx-auto mb-6">
          <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-slate-800 mb-2">数据分析</h2>
        <p className="text-slate-500 mb-6">此功能模块正在开发中，即将上线</p>
        <p className="text-sm text-slate-400">功能包括：用户行为分析、功能使用率统计、性能监控等</p>
      </div>
    </div>
  );
}
