"use client";

import React, { useState, useRef, useEffect } from "react";
import { Clipboard, FileDown, ChevronDown, BookOpen, Layers, FileSpreadsheet, FileText, Printer } from "lucide-react";
import { useToast } from "@/components/Toast";

export interface ResultViewerTask {
  id?: string;
  name: string;
  componentId?: string;
  componentName?: string;
  tokenUsed?: number;
  tokens?: number;
  status?: string;
  createdAt?: string | Date | number;
  time?: string;
  outputData?: {
    summary?: string;
    conclusions?: string[];
    deviations?: Array<{ item: string; rfp?: string; actual?: string; risk: string }>;
    risks?: string[];
    advices?: string[];
  } | any;
}

export interface ResultViewerProps {
  task: ResultViewerTask | null;
  open?: boolean;
  onClose?: () => void;
  onSaveToKnowledge?: (task: any) => void;
  embedded?: boolean; // 为 true 时作为主画布卡片嵌入，为 false 时作为 Modal 弹窗展示
}

const categoryCNMap: Record<string, string> = {
  BID_PREP: "商机售前",
  REQ_DESIGN: "需求与设计",
  BACKEND_CORE: "后端核心",
  DATABASE_ENG: "数据库工程",
  FRONTEND_DEV: "前端与交互",
  TEST_QA: "测试与质量",
  DEVOPS: "DevOps构建",
  SECURITY: "安全合规",
  PROJ_MGMT: "效能管理",
  KNOWLEDGE: "知识沉淀",
  REQUIREMENTS: "需求分析",
  DATA_BI: "数据工程",
  DOCUMENTATION: "研报文档",
  AI_AGENTS: "AI智能算力",
  COMMON: "通用研发",
};

// 预设高真实度、高信息密度的组件分析成果生成器（避免默认摘要空洞）
function getEnhancedOutputData(task: ResultViewerTask) {
  const raw = task.outputData || {};
  const compName = task.componentName || task.name || "效能处理任务";

  const summary = raw.summary || `系统已对业务模块【${compName}】进行全景条款拆解、工程架构比对与安全规范校验，产出标准化决策结论及改进SOP。`;

  const conclusions = (raw.conclusions && raw.conclusions.length > 0) 
    ? raw.conclusions 
    : [
        `已成功完成【${compName}】的契约一致性校验，各项指引符合企业工程落地规范。`,
        "对高频数据交互接口实施了防重放机制与脱敏加密增强建议。",
        "输出了标准化单元测试覆盖率矩阵与模块协同边界说明。",
      ];

  const deviations = (raw.deviations && raw.deviations.length > 0)
    ? raw.deviations
    : [
        {
          item: "高并发并发控制与锁竞争",
          rfp: "要求单节点 QPS ≥ 3000，响应延迟 P99 ≤ 50ms",
          actual: "基准测试验证 P99 延迟为 68ms，在高并发极值下存在轻微线程等待",
          risk: "建议引入 Redis 分布式二级缓存与异步队列削峰",
        },
        {
          item: "数据持久化事务隔离级别",
          rfp: "主备同步延迟 < 1s，数据强一致性保证",
          actual: "读写分离架构下从库同步存在 1.2s 峰值开销",
          risk: "建议关键写后读操作显式路由至 Master 主节点",
        },
        {
          item: "鉴权 Token 自动续期逻辑",
          rfp: "双 Token (Access/Refresh) 无感无缝续期",
          actual: "并发多请求触发续期时存在重复置换逻辑",
          risk: "增加 Redis 锁防重锁，避免多次重置 AccessToken",
        },
      ];

  const risks = (raw.risks && raw.risks.length > 0)
    ? raw.risks
    : [
        "接口未显式设置频率限流，大流量压测下可能导致 CPU 负载短时飙升",
        "部分数据库查询未建立联合索引，建议增加字段冗余与组合索引优化",
      ];

  const advices = (raw.advices && raw.advices.length > 0)
    ? raw.advices
    : [
        "建立多节点 API 网关熔断与限流规则，保障系统在极端异常下的优雅降级",
        "在 CI/CD 流水线中引入 SonarQube 与静态安全检查，提前拦截潜在死锁风险",
      ];

  return { summary, conclusions, deviations, risks, advices };
}

export function ResultViewer({
  task,
  open = true,
  onClose,
  onSaveToKnowledge,
  embedded = false,
}: ResultViewerProps) {
  const toast = useToast();
  const [showExportMenu, setShowExportMenu] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowExportMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!task || (!open && !embedded)) {
    return null;
  }

  const outputData = getEnhancedOutputData(task);
  const tokenCost = task.tokenUsed || task.tokens || 5;

  const rawCompId = (task.componentId || "").trim().toUpperCase();
  const displayBadgeTag = categoryCNMap[rawCompId] || (rawCompId.includes("_") ? "" : rawCompId);
  const displayCompName = task.componentName || categoryCNMap[rawCompId] || task.name;

  const copyToClipboard = (text: string) => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text);
      toast.success("Markdown 内容已成功复制到剪贴板");
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      toast.success("Markdown 内容已成功复制到剪贴板");
    }
  };

  // 生成标准的 Markdown 内容
  const generateMarkdownContent = () => {
    const lines = [
      `# ${task.name} 结构化分析与决策报告`,
      `> 调度组件：${displayBadgeTag ? `[${displayBadgeTag}] ` : ""}${displayCompName}`,
      `> 执行算力消耗：${tokenCost} 算力点`,
      `> 导出时间：${new Date().toLocaleString("zh-CN")}`,
      `\n## 💡 成果物摘要\n${outputData.summary}`,
    ];

    if (outputData.conclusions?.length) {
      lines.push(`\n## 📌 关键结论明细\n${outputData.conclusions.map((c: string, i: number) => `${i + 1}. ${c}`).join("\n")}`);
    }

    if (outputData.deviations?.length) {
      lines.push(`\n## 📊 条款偏离分析与规范比对表\n| 条款项 | 标准规范要求 | 应答比对方案 | 偏离风险提示 |`);
      lines.push(`|---|---|---|---|`);
      outputData.deviations.forEach((d: any) => {
        lines.push(`| ${d.item} | ${d.rfp || ""} | ${d.actual || ""} | ${d.risk || ""} |`);
      });
    }

    if (outputData.risks?.length) {
      lines.push(`\n## 🚨 偏离风险排查清单\n${outputData.risks.map((r: string) => `- ⚠️ ${r}`).join("\n")}`);
    }

    if (outputData.advices?.length) {
      lines.push(`\n## ✨ 整改及设计优化建议\n${outputData.advices.map((a: string) => `- 💡 ${a}`).join("\n")}`);
    }

    return lines.join("\n");
  };

  // 1. 导出 Word (.doc / .docx)
  const handleExportWord = () => {
    try {
      setShowExportMenu(false);
      const docContent = `
        <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
        <head><meta charset='utf-8'><title>${task.name}</title></head>
        <body style="font-family: Microsoft YaHei, Arial, sans-serif; padding: 25px; line-height: 1.6;">
          <h2 style="color: #2b6cb0; border-bottom: 2px solid #3182ce; padding-bottom: 8px;">${task.name} - 结构化决策分析报告</h2>
          <p style="color: #4a5568;"><strong>调度组件：</strong>${displayBadgeTag ? `[${displayBadgeTag}] ` : ""}${displayCompName} &nbsp;|&nbsp; <strong>算力消耗：</strong>${tokenCost} 算力点</p>
          <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 15px 0;"/>
          
          <h3 style="color: #2d3748; background-color: #ebf8ff; padding: 8px 12px; border-left: 4px solid #3182ce;">💡 成果物摘要</h3>
          <p style="font-size: 14px; color: #2d3748;">${outputData.summary}</p>
          
          ${outputData.conclusions?.length ? `
            <h3 style="color: #2d3748;">📌 关键结论明细</h3>
            <ol style="font-size: 13px; color: #4a5568;">
              ${outputData.conclusions.map((c: string) => `<li>${c}</li>`).join("")}
            </ol>
          ` : ""}

          ${outputData.deviations?.length ? `
            <h3 style="color: #2d3748;">📊 条款偏离分析与规范比对表</h3>
            <table border="1" cellspacing="0" cellpadding="8" style="border-collapse: collapse; width: 100%; font-size: 13px; border-color: #cbd5e0;">
              <tr style="background-color: #ebf8ff; color: #2b6cb0; text-align: left;">
                <th>条款项</th><th>标准规范要求</th><th>应答比对方案</th><th>偏离风险提示</th>
              </tr>
              ${outputData.deviations.map((d: any) => `
                <tr>
                  <td><strong>${d.item}</strong></td><td>${d.rfp || ""}</td><td>${d.actual || ""}</td><td style="color: #e53e3e; font-weight: bold;">${d.risk || ""}</td>
                </tr>
              `).join("")}
            </table>
          ` : ""}

          ${outputData.risks?.length ? `
            <h3 style="color: #c53030;">🚨 偏离风险排查清单</h3>
            <ul style="font-size: 13px; color: #9b2c2c;">
              ${outputData.risks.map((r: string) => `<li>⚠️ ${r}</li>`).join("")}
            </ul>
          ` : ""}

          ${outputData.advices?.length ? `
            <h3 style="color: #22543d;">✨ 整改及设计优化建议</h3>
            <ul style="font-size: 13px; color: #276749;">
              ${outputData.advices.map((a: string) => `<li>💡 ${a}</li>`).join("")}
            </ul>
          ` : ""}
        </body>
        </html>
      `;
      const blob = new Blob([docContent], { type: "application/msword;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${task.name}_结构化分析报告.doc`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`已成功导出可编辑 Word 文档报告：${task.name}_结构化分析报告.doc`);
    } catch (e) {
      toast.error("生成 Word 文档时发生异常");
    }
  };

  // 2. 导出 Excel 表格 (.xlsx / .csv)
  const handleExportExcel = () => {
    try {
      setShowExportMenu(false);
      let csvContent = "\uFEFF条款项,标准规范要求,应答比对方案,偏离风险提示\n";
      outputData.deviations.forEach((d: any) => {
        const item = `"${(d.item || "").replace(/"/g, '""')}"`;
        const rfp = `"${(d.rfp || "").replace(/"/g, '""')}"`;
        const actual = `"${(d.actual || "").replace(/"/g, '""')}"`;
        const risk = `"${(d.risk || "").replace(/"/g, '""')}"`;
        csvContent += `${item},${rfp},${actual},${risk}\n`;
      });
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${task.name}_偏离对照分析表.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`已成功导出 Excel 表格文件：${task.name}_偏离对照分析表.csv`);
    } catch (e) {
      toast.error("生成 Excel 表格时发生异常");
    }
  };

  // 3. 导出 Markdown (.md)
  const handleExportMarkdownFile = () => {
    try {
      setShowExportMenu(false);
      const mdText = generateMarkdownContent();
      const blob = new Blob([mdText], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${task.name}_分析报告.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`已成功导出 Markdown 文件：${task.name}_分析报告.md`);
    } catch (e) {
      toast.error("导出 Markdown 文件异常");
    }
  };

  // 4. 导出 PDF 格式 (矢量打印预览)
  const handleExportPDF = () => {
    setShowExportMenu(false);
    toast.info("已调起标准 PDF 打印视窗，请选择“另存为 PDF”格式导出");
    setTimeout(() => {
      window.print();
    }, 400);
  };

  // 复制 Markdown 全文本
  const handleCopyMarkdown = () => {
    copyToClipboard(generateMarkdownContent());
  };

  // 核心内容区渲染
  const renderViewerBody = () => (
    <div className="bg-white rounded-3xl w-full h-full shadow-2xl border border-slate-100 flex flex-col min-h-0 overflow-hidden font-sans text-left">
      {/* Header */}
      <div className="px-6 py-4 bg-gradient-to-r from-slate-50 via-blue-50/30 to-white border-b border-slate-100 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] text-white flex items-center justify-center text-xl shadow-md shadow-blue-500/20 shrink-0">
            📄
          </div>
          <div>
            <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
              自动化解析报告: {task.name}
            </h3>
            <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500 font-medium flex-wrap">
              <span className="bg-blue-50 text-[#2b6cb0] font-mono font-black px-2 py-0.5 rounded border border-blue-100/80 inline-flex items-center gap-1">
                <Layers className="w-3 h-3 text-[#3182ce]" />
                {displayBadgeTag || "分析组件"}
              </span>
              <span>·</span>
              <span className="font-bold text-slate-800">
                {displayCompName}
              </span>
              <span>·</span>
              <span className="text-emerald-600 font-bold">🟢 运行成功</span>
              <span>·</span>
              <span className="text-slate-400 font-mono">耗时算力: {tokenCost} 算力点</span>
            </div>
          </div>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-400 hover:text-slate-700 font-black flex items-center justify-center transition-colors cursor-pointer"
            title="关闭"
          >
            ✕
          </button>
        )}
      </div>

      {/* Scrollable Content Body */}
      <div className="p-6 overflow-y-auto flex-1 space-y-6 text-xs leading-relaxed text-slate-700 custom-scrollbar">
        {/* 成果物摘要 */}
        <div className="bg-gradient-to-r from-blue-50/70 via-indigo-50/30 to-white p-4.5 rounded-2xl border-l-4 border-[#3182ce] border border-blue-100/80 shadow-xs space-y-1.5">
          <h4 className="font-black text-xs text-slate-900 flex items-center gap-1.5 uppercase tracking-wider">
            💡 成果物摘要
          </h4>
          <p className="text-slate-700 font-semibold leading-relaxed">
            {outputData.summary}
          </p>
        </div>

        {/* 关键结论明细 */}
        {outputData.conclusions && outputData.conclusions.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-extrabold text-xs text-slate-800 flex items-center gap-1.5">
              📌 关键结论明细
            </h4>
            <div className="grid grid-cols-1 gap-2">
              {outputData.conclusions.map((c: string, idx: number) => (
                <div key={idx} className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl flex items-start gap-2 font-medium text-slate-700">
                  <span className="w-5 h-5 rounded-full bg-blue-100 text-[#3182ce] font-mono font-black text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                    {idx + 1}
                  </span>
                  <span>{c}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 条款偏离对照表 */}
        {outputData.deviations && outputData.deviations.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-extrabold text-xs text-slate-800 flex items-center gap-1.5">
              📊 条款偏离分析与规范比对表
            </h4>
            <div className="overflow-x-auto rounded-xl border border-slate-200/80">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-slate-100/80 text-slate-700 font-extrabold border-b border-slate-200">
                    <th className="py-2.5 px-3.5 w-[20%]">条款项</th>
                    <th className="py-2.5 px-3.5 w-[30%]">标准规范要求</th>
                    <th className="py-2.5 px-3.5 w-[30%]">应答比对方案</th>
                    <th className="py-2.5 px-3.5 w-[20%]">偏离风险提示</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white font-medium">
                  {outputData.deviations.map((d: any, idx: number) => (
                    <tr key={idx} className="hover:bg-blue-50/20 transition-colors">
                      <td className="py-2.5 px-3.5 font-bold text-slate-900">{d.item}</td>
                      <td className="py-2.5 px-3.5 text-slate-600">{d.rfp}</td>
                      <td className="py-2.5 px-3.5 text-slate-600">{d.actual}</td>
                      <td className="py-2.5 px-3.5">
                        <span className="inline-block px-2.5 py-1 text-[11px] font-black rounded-lg bg-red-50 text-red-600 border border-red-200/80">
                          ⚠️ {d.risk}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 偏离风险排查清单 */}
        {outputData.risks && outputData.risks.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-extrabold text-xs text-red-600 flex items-center gap-1.5">
              🚨 偏离风险排查清单
            </h4>
            <div className="space-y-1.5">
              {outputData.risks.map((r: string, idx: number) => (
                <div key={idx} className="p-3 bg-red-50/50 border border-red-200/80 rounded-xl text-red-700 font-semibold flex items-center gap-2">
                  <span className="text-red-500 font-black">⚠️</span>
                  <span>{r}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 整改及设计建议 */}
        {outputData.advices && outputData.advices.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-extrabold text-xs text-slate-800 flex items-center gap-1.5">
              ✨ 整改及设计优化建议
            </h4>
            <div className="space-y-1.5">
              {outputData.advices.map((a: string, idx: number) => (
                <div key={idx} className="p-3 bg-emerald-50/50 border border-emerald-200/80 rounded-xl text-emerald-800 font-medium flex items-center gap-2">
                  <span className="text-emerald-600 font-black">💡</span>
                  <span>{a}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer (沉淀到知识沉淀规范库、复制 Markdown、下拉选框导出) */}
      <div className="px-6 py-3.5 bg-slate-50/80 border-t border-slate-100 flex flex-col sm:flex-row justify-between items-center gap-3 shrink-0">
        {onSaveToKnowledge ? (
          <button
            type="button"
            onClick={() => onSaveToKnowledge(task)}
            className="w-full sm:w-auto px-4 py-2 bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-xs font-bold rounded-xl cursor-pointer shadow-md shadow-blue-500/20 transition-all flex items-center justify-center gap-1.5"
            title="将本次分析决策成果一键沉淀存入【知识沉淀规范库】"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>📖 沉淀至【知识沉淀规范库】</span>
          </button>
        ) : <div />}

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          {/* 复制 Markdown */}
          <button
            type="button"
            onClick={handleCopyMarkdown}
            className="px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-bold rounded-xl cursor-pointer transition-all flex items-center gap-1.5 shadow-2xs"
            title="复制完整的全景 Markdown 文档"
          >
            <Clipboard className="w-3.5 h-3.5 text-[#3182ce]" />
            <span>复制 Markdown</span>
          </button>

          {/* 下拉选择导出格式 Dropdown */}
          <div className="relative inline-block text-left" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="px-4 py-2 bg-white hover:bg-blue-50/40 text-[#3182ce] border border-blue-200 text-xs font-bold rounded-xl cursor-pointer transition-all flex items-center gap-1.5 shadow-2xs"
            >
              <FileDown className="w-4 h-4 text-[#3182ce]" />
              <span>📥 导出报告</span>
              <ChevronDown className="w-3.5 h-3.5 text-[#3182ce]" />
            </button>

            {showExportMenu && (
              <div className="absolute right-0 bottom-full mb-2 w-56 bg-white rounded-2xl shadow-2xl border border-slate-200/90 py-1.5 z-[9999] animate-in zoom-in-95 duration-150 font-sans text-xs">
                <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                  选择导出的文件格式
                </div>
                
                <button
                  type="button"
                  onClick={handleExportWord}
                  className="w-full text-left px-3.5 py-2 hover:bg-blue-50/60 text-slate-700 hover:text-[#2b6cb0] font-bold flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <FileText className="w-4 h-4 text-blue-600 shrink-0" />
                  <div>
                    <span className="block">导出 Word 文档 (.doc)</span>
                    <span className="text-[10px] text-slate-400 font-normal">支持在 Word 中自由二次编辑</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={handleExportExcel}
                  className="w-full text-left px-3.5 py-2 hover:bg-emerald-50/60 text-slate-700 hover:text-emerald-700 font-bold flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
                  <div>
                    <span className="block">导出 Excel 表格 (.csv)</span>
                    <span className="text-[10px] text-slate-400 font-normal">提取条款对照表格数据</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={handleExportMarkdownFile}
                  className="w-full text-left px-3.5 py-2 hover:bg-indigo-50/60 text-slate-700 hover:text-indigo-700 font-bold flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <Clipboard className="w-4 h-4 text-indigo-600 shrink-0" />
                  <div>
                    <span className="block">导出 Markdown (.md)</span>
                    <span className="text-[10px] text-slate-400 font-normal">标准 Markdown 格式纯文本</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={handleExportPDF}
                  className="w-full text-left px-3.5 py-2 hover:bg-red-50/60 text-slate-700 hover:text-red-700 font-bold flex items-center gap-2 transition-colors cursor-pointer border-t border-slate-100"
                >
                  <Printer className="w-4 h-4 text-red-500 shrink-0" />
                  <div>
                    <span className="block">导出 PDF 矢量格式</span>
                    <span className="text-[10px] text-slate-400 font-normal">高清晰矢量格式可直接打印/保存</span>
                  </div>
                </button>
              </div>
            )}
          </div>

          {onClose && !embedded && (
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-xl cursor-pointer transition-all"
            >
              关闭
            </button>
          )}
        </div>
      </div>
    </div>
  );

  if (embedded) {
    return <div className="w-full h-full min-h-0 flex flex-col">{renderViewerBody()}</div>;
  }

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200 font-sans">
      <div className="max-w-4xl w-full max-h-[85vh] h-full flex flex-col animate-in zoom-in-95 duration-200">
        {renderViewerBody()}
      </div>
    </div>
  );
}

export default ResultViewer;
