"use client";

import {
  translateDetailKey,
  formatDetailValue,
  parseLogDetails,
} from "@/lib/log-details";

interface EnrichedTarget {
  id?: string;
  name?: string | null;
  email?: string | null;
  title?: string | null;
  category?: string | null;
  role?: string | null;
}

interface OperationLogDetailsProps {
  log: {
    details?: unknown;
    parsedDetails?: unknown;
    targetUser?: EnrichedTarget | null;
    targetComponent?: EnrichedTarget | null;
    targetDocument?: EnrichedTarget | null;
    workspace?: EnrichedTarget | null;
  };
}

// 操作审计日志「细节」可读化展示组件：优先呈现人类摘要，再列出结构化字段与关联实体。
// 真实数据全部来自后端日志，本组件只做中文转译与排版，不伪造任何内容。
export function OperationLogDetails({ log }: OperationLogDetailsProps) {
  const parsed =
    (log.parsedDetails as Record<string, unknown> | string | null) ??
    parseLogDetails(log.details);
  const isObject = parsed && typeof parsed === "object";
  const detailObj = isObject ? (parsed as Record<string, unknown>) : null;
  const summary = typeof detailObj?.message === "string" ? detailObj.message : null;

  // 关联实体 ID 字段合并为一处「操作对象」展示，避免与明细字段重复
  const entityIdKeys = new Set([
    "targetUserId",
    "kickedUserId",
    "userId",
    "componentId",
    "targetComponentId",
    "knowledgeId",
    "documentId",
  ]);

  const entries = detailObj
    ? Object.entries(detailObj).filter(
        ([k, v]) =>
          k !== "message" &&
          !entityIdKeys.has(k) &&
          v !== null &&
          v !== undefined &&
          v !== "",
      )
    : [];

  if (!summary && entries.length === 0 && !log.targetUser && !log.targetComponent && !log.targetDocument && !log.workspace) {
    return (
      <div className="px-4 py-3 text-xs text-slate-400">
        该条日志未记录结构化的操作细节。
      </div>
    );
  }

  return (
    <div className="px-4 py-3.5 bg-slate-50/80 border-t border-slate-100 space-y-3">
      {summary && (
        <div className="flex items-start gap-2">
          <span className="shrink-0 mt-0.5 px-2 py-0.5 rounded bg-[#3182ce]/10 text-[#2b6cb0] border border-[#3182ce]/20 text-[11px] font-bold">
            操作摘要
          </span>
          <p className="text-sm font-semibold text-slate-800 leading-relaxed">{summary}</p>
        </div>
      )}

      {(log.targetUser || log.targetComponent || log.targetDocument || log.workspace) && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold text-slate-400">操作对象：</span>
          {log.targetUser && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white border border-slate-200 text-xs font-medium text-slate-700">
              <span className="text-slate-400">用户</span>
              {log.targetUser.name || log.targetUser.email || log.targetUser.id}
            </span>
          )}
          {log.targetComponent && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white border border-slate-200 text-xs font-medium text-slate-700">
              <span className="text-slate-400">组件</span>
              {log.targetComponent.name || log.targetComponent.id}
            </span>
          )}
          {log.targetDocument && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white border border-slate-200 text-xs font-medium text-slate-700">
              <span className="text-slate-400">知识</span>
              {log.targetDocument.title || log.targetDocument.id}
            </span>
          )}
          {log.workspace && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white border border-slate-200 text-xs font-medium text-slate-700">
              <span className="text-slate-400">工作空间</span>
              {log.workspace.name || log.workspace.id}
            </span>
          )}
        </div>
      )}

      {entries.length > 0 && (
        <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1.5">
          {entries.map(([key, value]) => (
            <div key={key} className="flex items-baseline gap-2 min-w-0">
              <dt className="shrink-0 text-[11px] font-semibold text-slate-400">
                {translateDetailKey(key)}：
              </dt>
              <dd className="text-xs text-slate-700 font-mono break-all">
                {formatDetailValue(value)}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {typeof parsed === "string" && !summary && (
        <p className="text-xs text-slate-600 font-mono leading-relaxed whitespace-pre-wrap">
          {parsed}
        </p>
      )}
    </div>
  );
}
