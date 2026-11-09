# -*- coding: utf-8 -*-
# /models 页自查清单修复：LoadErrorBanner + 断网友好文案 + 空态引导 + 分页 + 枚举 DB 化
import io, re

P = "src/app/models/page.tsx"
s = io.open(P, encoding="utf-8").read()

# 1. imports
if "LoadErrorBanner" not in s:
    a = 'import { getAuthToken } from "@/utils/auth";'
    if a not in s:
        a = 'import { useEffect, useMemo, useState } from "react";'
    assert a in s, "import anchor"
    s = s.replace(a, a + '\nimport LoadErrorBanner from "@/components/admin/LoadErrorBanner";', 1)
if "formatNumber" not in s:
    # 找第一个 from import 追加
    i = s.find('import {')
    le = s.find('\n', i)
    # 找 point-rate import 行后追加
    a = 'import { yuanToPoints, formatYuanFromPoints, POINT_UNIT_HINT, POINTS_PER_YUAN } from "@/lib/point-rate";'
    assert a in s, "point-rate import"
    s = s.replace(a, a + '\nimport { formatNumber, formatDate } from "@/utils/format";', 1)

# 2. 断网友好文案
old = 'if (alive) setError((e as Error)?.message || "加载失败");'
new = 'if (alive) setError("网络异常，模型定价加载失败，请检查网络后重试");'
assert old in s, "error msg"
s = s.replace(old, new, 1)

# 3. 错误态改 LoadErrorBanner
old = """        ) : error ? (
          <div className="text-center py-20 text-sm text-rose-600 font-bold bg-rose-50 border border-rose-200 rounded-2xl">
            {error}
          </div>
        ) : filtered.length === 0 ? ("""
new = """        ) : error ? (
          <div className="px-4">
            <LoadErrorBanner message={error} onRetry={() => { setError(null); loadModels(); }} retrying={loading} />
          </div>
        ) : filtered.length === 0 ? ("""
assert old in s, "error JSX"
s = s.replace(old, new, 1)

# 4. 空态引导按钮
old = """          <div className="text-center py-20 text-sm text-slate-400 font-bold">
            暂无可展示的模型定价（{keyword || providerFilter || capFilter || onlyPriced ? "无匹配结果" : "平台尚未配置开放模型"}）
          </div>"""
new = """          <div className="text-center py-20 text-sm text-slate-400 font-bold">
            暂无可展示的模型定价（{keyword || providerFilter || capFilter || onlyPriced ? "无匹配结果" : "平台尚未配置开放模型"}）
            {(keyword || providerFilter || capFilter || onlyPriced) && (
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => { setSearchKeyword(""); setProviderFilter(""); setCapFilter(""); setOnlyPriced(false); }}
                  className="px-4 py-2 bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-xs font-black rounded-xl cursor-pointer"
                >
                  清空筛选条件
                </button>
              </div>
            )}
          </div>"""
assert old in s, "empty state"
s = s.replace(old, new, 1)

io.open(P, "w", encoding="utf-8", newline="").write(s)
print("models banner/empty OK")
