"use client";

export default function PlatformSettingsPage() {
  return (
    <div className="space-y-6">
      <div className="shrink-0">
        <h1 className="text-2xl font-black text-slate-800">平台设置</h1>
        <p className="text-sm text-slate-500 mt-1">
          知阁·舟坊全局系统配置
        </p>
      </div>

      <div className="bg-white rounded-[8px] border border-slate-100 shadow-sm p-6">
        <div className="text-center py-12">
          <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
            <span className="text-slate-400 text-2xl">⚙️</span>
          </div>
          <p className="text-slate-600 font-medium">平台设置功能开发中...</p>
        </div>
      </div>
    </div>
  );
}
