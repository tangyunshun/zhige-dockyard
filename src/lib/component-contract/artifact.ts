/**
 * 组件成果物（ResultArtifact）真实类型与「合同输出类型 -> 成果物类型」穷举映射。
 *
 * 原则（不可妥协）：
 *  1. 纯领域模块，不依赖任何具体组件 / 厂商 / 模型；
 *  2. ComponentOutputKind 的七种输出必须全部被穷举覆盖，禁止 lowercase 强转、
 *     禁止伪装成无关类型（如把 DOCUMENT 伪造成 "prd"）；
 *  3. ResultArtifact 必须包含 id / type / title / mimeType / schemaVersion / content /
 *     previewable 等完整字段；
 *  4. 未知输出类型一律明确抛错，绝不猜测。
 */

import { randomUUID } from "crypto";
import { ComponentContractError } from "./errors";
import type { ComponentOutputKind, RendererType } from "./types";

/**
 * 真实成果物类型（契约输出的真实落点）。
 * 说明：score / timeline / document_package 为合同 SCORE / TIMELINE / DOCUMENT_PACKAGE
 * 的真实类型，不得降级伪装为 report/json 等无关类型。
 */
export type ResultArtifactType =
  | "document"
  | "report"
  | "table"
  | "score"
  | "timeline"
  | "json"
  | "code"
  | "image"
  | "file"
  | "document_package"
  | "bundle";

/** 完整成果物结构（字段完整，禁止缺省关键字段） */
export interface ResultArtifact {
  id: string;
  type: ResultArtifactType;
  title: string;
  mimeType: string;
  schemaVersion: string;
  content?: unknown;
  downloadUrl?: string | null;
  previewable: boolean;
  downloadable: boolean;
  /** 合同声明的渲染器类型（供展示链路选择可视化方式） */
  rendererType?: RendererType | string;
}

/** 组件合同输出类型 -> 成果物真实类型（穷举，Record 保证七种全部覆盖） */
export const OUTPUT_KIND_TO_ARTIFACT_TYPE: Record<ComponentOutputKind, ResultArtifactType> = {
  DOCUMENT: "document",
  TABLE: "table",
  SCORE: "score",
  TIMELINE: "timeline",
  JSON: "json",
  FILE: "file",
  DOCUMENT_PACKAGE: "document_package",
};

/** 各成果物类型的默认 MIME（仅在合同未声明 artifactMime 时使用，不做类型伪装） */
export const DEFAULT_MIME_BY_ARTIFACT_TYPE: Record<ResultArtifactType, string> = {
  document: "text/markdown",
  report: "text/markdown",
  table: "application/json",
  score: "application/json",
  timeline: "application/json",
  json: "application/json",
  code: "text/plain",
  image: "image/png",
  file: "application/octet-stream",
  document_package: "application/json",
  bundle: "application/json",
};

const RESULT_ARTIFACT_TYPES: ReadonlySet<string> = new Set<ResultArtifactType>([
  "document",
  "report",
  "table",
  "score",
  "timeline",
  "json",
  "code",
  "image",
  "file",
  "document_package",
  "bundle",
]);

export function isResultArtifactType(value: unknown): value is ResultArtifactType {
  return typeof value === "string" && RESULT_ARTIFACT_TYPES.has(value);
}

/**
 * 合同输出类型 -> 成果物类型。未知类型明确抛错（不猜测、不降级）。
 */
export function mapOutputKindToArtifactType(kind: string): ResultArtifactType {
  const mapped = OUTPUT_KIND_TO_ARTIFACT_TYPE[kind as ComponentOutputKind];
  if (!mapped) {
    throw new ComponentContractError(
      "CONTRACT_VALIDATION_FAILED",
      `未知的组件输出类型 [${String(kind)}]，无法建立成果物映射；合同输出类型必须属于标准白名单！`
    );
  }
  return mapped;
}

/**
 * 依据合同输出类型构建完整成果物。
 * 覆盖 id / type / title / mimeType / schemaVersion / content / previewable / downloadable。
 */
export function buildResultArtifact(params: {
  outputKind: string;
  title: string;
  content: unknown;
  artifactMime?: string | null;
  schemaVersion?: string | null;
  rendererType?: string | null;
  previewable?: boolean;
  downloadable?: boolean;
  downloadUrl?: string | null;
}): ResultArtifact {
  const type = mapOutputKindToArtifactType(params.outputKind);
  const mime = params.artifactMime && params.artifactMime.trim() ? params.artifactMime.trim() : DEFAULT_MIME_BY_ARTIFACT_TYPE[type];
  const schemaVersion = params.schemaVersion && params.schemaVersion.trim() ? params.schemaVersion.trim() : "v1";
  return {
    id: `artifact_${randomUUID()}`,
    type,
    title: params.title,
    mimeType: mime,
    schemaVersion,
    content: params.content,
    downloadUrl: params.downloadUrl ?? null,
    previewable: params.previewable ?? true,
    downloadable: params.downloadable ?? false,
    rendererType: params.rendererType ?? undefined,
  };
}
