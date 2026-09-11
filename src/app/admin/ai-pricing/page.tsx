"use client";

/**
 * 算力计价与厂商折算（后台可配置）
 *
 * 1. 统一口径：全系统只使用「算力点」，1 token = 1 算力点，100 算力点 = 1 元；
 * 2. 各 AI 厂商按自身官方价折算成算力点，价格与加价系数可在线编辑并写入数据库；
 * 3. 保存后即时生效（60 秒缓存窗口），无需发版；未迁移配置表时自动回退内置默认值。
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Zap,
  Copy,
  Check,
  Calculator,
  Info,
  AlertTriangle,
  Coins,
  Save,
  RotateCcw,
} from "lucide-react";
import {
  DEFAULT_MARKUP,
  MIN_MARKUP,
  UNIT_EXPLAIN_HINT,
  marginRate,
  pointsToTokens,
  pointsPerToken,
  TYPICAL_CALL_INPUT_TOKENS,
  TYPICAL_CALL_OUTPUT_TOKENS,
} from "@/lib/model-rate";
import {
  POINT_UNIT_HINT,
  POINT_RATE_HINT,
  POINTS_PER_YUAN,
} from "@/lib/point-rate";
import { useToast } from "@/components/Toast";
import { getAuthToken } from "@/utils/auth";
import type { PricingConfig } from "@/lib/pricing-config";

/** 会员等级参考（以数据库 membershiplevel 实际配置为准，此处用于盈利能力体检） */
const LEVEL_REFERENCE = [
  { name: "免费版 FREE", monthlyYuan: 0, grantedPoints: 100 },
  { name: "青铜 BRONZE", monthlyYuan: 29, grantedPoints: 3000 },
  { name: "白银 SILVER", monthlyYuan: 59, grantedPoints: 7000 },
  { name: "黄金 GOLD", monthlyYuan: 169, grantedPoints: 25000 },
  { name: "钻石 DIAMOND", monthlyYuan: 499, grantedPoints: 90000 },
  { name: "皇冠 CROWN", monthlyYuan: 999, grantedPoints: 200000 },
];

export default function AdminAiPricingPage() {
  const { success: toastSuccess, error: toastError } = useToast();

  const [config, setConfig] = useState<PricingConfig | null>(null);
  const [persisted, setPersisted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/settings/pricing", {
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        setConfig(data.config);
        setPersisted(!!data.persisted);
      } else {
        toastError(data?.error || "读取计价配置失败");
      }
    } catch {
      toastError("网络异常，读取计价配置失败");
    } finally {
      setLoading(false);
    }
  }, [toastError]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const markup = config?.markup ?? DEFAULT_MARKUP;
  const providers = config?.providers ?? [];
  const margin = marginRate(markup);

  const setMarkup = (v: number) =>
    setConfig((prev) => (prev ? { ...prev, markup: Math.max(MIN_MARKUP, v) } : prev));

  const updatePrice = (
    providerId: string,
    modelId: string,
    kind: "inputPricePerMillion" | "outputPricePerMillion",
    value: number
  ) =>
    setConfig((prev) =>
      prev
        ? {
            ...prev,
            providers: prev.providers.map((p) =>
              p.id !== providerId
                ? p
                : {
                    ...p,
                    models: p.models.map((m) =>
                      m.id !== modelId ? m : { ...m, [kind]: Math.max(0, value) }
                    ),
                  }
            ),
          }
        : prev
    );

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/settings/pricing", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getAuthToken()}`,
        },
        body: JSON.stringify({ config }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        setConfig(data.config);
        setPersisted(true);
        toastSuccess("计价配置已保存，将在 1 分钟内生效");
      } else {
        toastError(data?.error || "保存失败");
      }
    } catch {
      toastError("网络异常，保存失败");
    } finally {
      setSaving(false);
    }
  };

  const configSnippet = useMemo(() => {
    if (!config) return "";
    return JSON.stringify(config, null, 2);
  }, [config]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(configSnippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="space-y-6 pb-8 text-left font-sans">
      {/* 页头 */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-black text-slate-800 flex items-center gap-2">
              <Calculator className="w-5 h-5 text-[#3182ce]" />
              算力计价与厂商折算
            </h1>
            <p className="text-xs text-slate-500 font-medium mt-1.5">
              AI 模型 token 与「算力点」的折算规则、各厂商成本与毛利率测算（在线可调，保存即生效）
            </p>
          </div>
          <div className="flex items-center gap-2">
            {!persisted && !loading && (
              <span className="px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-[11px] font-black text-amber-700">
                ⚠ 使用内置默认值（配置表未迁移/未保存）
              </span>
            )}
            {persisted && (
              <span className="px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-[11px] font-black text-emerald-700">
                ✓ 已启用数据库配置
              </span>
            )}
            <button
              type="button"
              onClick={loadConfig}
              disabled={loading}
              className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              重新加载
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !config}
              className="px-4 py-1.5 rounded-xl bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-xs font-black inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? "保存中..." : "保存配置"}
            </button>
          </div>
        </div>
      </div>

      {/* 统一口径 */}
      <div className="bg-gradient-to-br from-[#3182ce]/5 to-[#8b5cf6]/5 rounded-2xl border border-slate-200/80 p-6 shadow-xs">
        <h2 className="text-sm font-black text-slate-800 flex items-center gap-2 mb-3">
          <Info className="w-4 h-4 text-[#3182ce]" />
          一、全系统统一口径
        </h2>
        <div className="space-y-2 text-xs font-bold text-slate-700 leading-relaxed">
          <p>{POINT_UNIT_HINT}</p>
          <p className="text-slate-500">{POINT_RATE_HINT}</p>
          <p className="text-slate-500">{UNIT_EXPLAIN_HINT}</p>
          <div className="mt-3 p-3 bg-white rounded-xl border border-slate-200 font-mono text-[11px] text-slate-700">
            pointsPerToken = 官方单价(元/百万token) ÷ 10,000 × 加价系数 k
            <br />
            毛利率 = 1 − 1 / k
          </div>
        </div>
      </div>

      {/* 加价系数 */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs">
        <h2 className="text-sm font-black text-slate-800 flex items-center gap-2 mb-4">
          <Coins className="w-4 h-4 text-[#3182ce]" />
          二、加价系数（决定毛利率）
        </h2>
        <div className="flex flex-wrap items-center gap-4">
          <input
            type="range"
            min={1.2}
            max={5}
            step={0.1}
            value={markup}
            onChange={(e) => setMarkup(Number(e.target.value))}
            className="flex-1 min-w-[220px] accent-[#3182ce] cursor-pointer"
          />
          <input
            type="number"
            min={MIN_MARKUP}
            step={0.1}
            value={markup}
            onChange={(e) => setMarkup(Number(e.target.value))}
            className="w-24 px-3 py-2 border border-slate-200 rounded-xl text-xs font-black text-center focus:border-[#3182ce] outline-none"
          />
          <div className="px-4 py-2 rounded-xl bg-emerald-50 border border-emerald-200">
            <span className="text-[11px] font-bold text-emerald-700">毛利率 </span>
            <span className="text-sm font-black text-emerald-700">
              {(margin * 100).toFixed(1)}%
            </span>
          </div>
        </div>
        <p className="text-[11px] font-bold text-slate-400 mt-3">
          k = 1.0 为成本价（0 毛利，倒贴运营）；默认 {DEFAULT_MARKUP}（60% 毛利）。用户花 ¥1 得{" "}
          {POINTS_PER_YUAN} 算力点。
        </p>
      </div>

      {/* 折算表（可编辑） */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-sm font-black text-slate-800 flex items-center gap-2">
            <Zap className="w-4 h-4 text-[#3182ce]" />
            三、厂商 × 模型折算表（价格可直接编辑）
          </h2>
          <p className="text-[11px] font-bold text-slate-400 mt-1">
            单位：元 / 百万 token；典型调用按 {TYPICAL_CALL_INPUT_TOKENS.toLocaleString()} 输入 +{" "}
            {TYPICAL_CALL_OUTPUT_TOKENS.toLocaleString()} 输出 token 估算
          </p>
        </div>

        {loading ? (
          <div className="py-16 text-center text-xs font-bold text-slate-400">
            正在加载计价配置...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[980px]">
              <thead className="bg-slate-50/90 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-bold">
                <tr>
                  <th className="px-4 py-3 text-left whitespace-nowrap">厂商 / 模型</th>
                  <th className="px-4 py-3 text-right whitespace-nowrap">输入价</th>
                  <th className="px-4 py-3 text-right whitespace-nowrap">输出价</th>
                  <th className="px-4 py-3 text-right whitespace-nowrap">1 点可买(输入)</th>
                  <th className="px-4 py-3 text-right whitespace-nowrap">1 点可买(输出)</th>
                  <th className="px-4 py-3 text-right whitespace-nowrap">成本价可买(输出)</th>
                  <th className="px-4 py-3 text-right whitespace-nowrap">典型调用扣点</th>
                  <th className="px-4 py-3 text-right whitespace-nowrap">毛利</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {providers.map((provider) =>
                  provider.models.map((model) => {
                    const k = provider.markup ?? markup;
                    const actualIn = pointsToTokens(1, model.inputPricePerMillion, k);
                    const actualOut = pointsToTokens(1, model.outputPricePerMillion, k);
                    const breakEvenOut = pointsToTokens(
                      1,
                      model.outputPricePerMillion,
                      MIN_MARKUP
                    );
                    const perCall = Math.max(
                      1,
                      Math.ceil(
                        TYPICAL_CALL_INPUT_TOKENS *
                          pointsPerToken(model.inputPricePerMillion, k) +
                          TYPICAL_CALL_OUTPUT_TOKENS *
                            pointsPerToken(model.outputPricePerMillion, k)
                      )
                    );
                    return (
                      <tr
                        key={`${provider.id}-${model.id}`}
                        className="hover:bg-slate-50/80"
                      >
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="font-black text-slate-800">{provider.name}</div>
                          <div className="text-[11px] font-bold text-slate-400">
                            {model.name}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <input
                            type="number"
                            step={0.1}
                            value={model.inputPricePerMillion}
                            onChange={(e) =>
                              updatePrice(
                                provider.id,
                                model.id,
                                "inputPricePerMillion",
                                Number(e.target.value)
                              )
                            }
                            className="w-24 px-2 py-1 text-right border border-slate-200 rounded-lg font-mono font-bold text-slate-700 focus:border-[#3182ce] outline-none"
                          />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <input
                            type="number"
                            step={0.1}
                            value={model.outputPricePerMillion}
                            onChange={(e) =>
                              updatePrice(
                                provider.id,
                                model.id,
                                "outputPricePerMillion",
                                Number(e.target.value)
                              )
                            }
                            className="w-24 px-2 py-1 text-right border border-slate-200 rounded-lg font-mono font-bold text-slate-700 focus:border-[#3182ce] outline-none"
                          />
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-[#3182ce]">
                          {actualIn.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-black text-[#3182ce]">
                          {actualOut.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-slate-400">
                          {breakEvenOut.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-black text-slate-800">
                          {perCall}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 font-black text-[11px]">
                            {(marginRate(k) * 100).toFixed(0)}%
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 会员盈利能力体检 */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-sm font-black text-slate-800 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            四、会员等级盈利能力体检
          </h2>
          <p className="text-[11px] font-bold text-slate-400 mt-1">
            按「赠送算力点 × 实耗率 × 单位成本」估算；数据以数据库实际配置为准
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[720px]">
            <thead className="bg-slate-50/90 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-bold">
              <tr>
                <th className="px-4 py-3 text-left whitespace-nowrap">会员等级</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">月费</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">赠送算力点</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">名义价值</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">30% 实耗</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">60% 实耗</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">100% 实耗</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {LEVEL_REFERENCE.map((lv) => {
                const unitCost = 1 / POINTS_PER_YUAN / markup;
                const nominal = lv.grantedPoints / POINTS_PER_YUAN;
                const cost30 = lv.grantedPoints * 0.3 * unitCost;
                const cost60 = lv.grantedPoints * 0.6 * unitCost;
                const cost100 = lv.grantedPoints * unitCost;
                return (
                  <tr key={lv.name} className="hover:bg-slate-50/80">
                    <td className="px-4 py-3 font-black text-slate-800 whitespace-nowrap">
                      {lv.name}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-slate-700">
                      ¥{lv.monthlyYuan}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-slate-700">
                      {lv.grantedPoints.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-[#3182ce]">
                      ¥{nominal.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-emerald-600">
                      ¥{cost30.toFixed(2)}
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-mono font-bold ${
                        cost60 > lv.monthlyYuan ? "text-red-600" : "text-emerald-600"
                      }`}
                    >
                      ¥{cost60.toFixed(2)}
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-mono font-black ${
                        cost100 > lv.monthlyYuan ? "text-red-600" : "text-emerald-600"
                      }`}
                    >
                      ¥{cost100.toFixed(2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="px-6 py-3 bg-amber-50/60 border-t border-amber-200">
          <p className="text-[11px] font-bold text-amber-800 leading-relaxed">
            ⚠ 「名义价值」按 1 点 = 0.01 元计；「实耗成本」= 赠送点数 × 实耗率 × (0.01 ÷ k)。
            会员赠送的算力点名义价值普遍高于月费，能否盈利取决于实耗率与加价系数 k。
          </p>
        </div>
      </div>

      {/* 配置 JSON */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-black text-slate-800 flex items-center gap-2">
            <Copy className="w-4 h-4 text-[#3182ce]" />
            五、当前配置 JSON（备份 / 迁移用）
          </h2>
          <button
            type="button"
            onClick={handleCopy}
            className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? "已复制" : "复制"}
          </button>
        </div>
        <pre className="bg-slate-900 text-slate-100 rounded-xl p-4 text-[11px] font-mono overflow-x-auto leading-relaxed max-h-80">
          {configSnippet || "加载中..."}
        </pre>
        <p className="text-[11px] font-bold text-slate-400 mt-2">
          配置已持久化到数据库（system_setting 表，key = ai_pricing_config）；未迁移时回退到
          <code> src/lib/model-rate.ts </code>内置默认值。
        </p>
      </div>
    </div>
  );
}
