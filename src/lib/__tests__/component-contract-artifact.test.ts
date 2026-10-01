import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  OUTPUT_KIND_TO_ARTIFACT_TYPE,
  buildResultArtifact,
  mapOutputKindToArtifactType,
  isResultArtifactType,
} from "@/lib/component-contract/artifact";
import { ComponentContractError } from "@/lib/component-contract/errors";
import type { ComponentOutputKind } from "@/lib/component-contract/types";

const ALL_OUTPUT_KINDS: ComponentOutputKind[] = [
  "DOCUMENT",
  "TABLE",
  "SCORE",
  "TIMELINE",
  "JSON",
  "FILE",
  "DOCUMENT_PACKAGE",
];

describe("组件成果物：合同输出类型 -> 成果物类型穷举映射", () => {
  test("七种合同输出类型全部被穷举覆盖，且映射为真实类型", () => {
    // 穷举：Record 必须包含全部 7 种，缺一即失败
    for (const kind of ALL_OUTPUT_KINDS) {
      const mapped = OUTPUT_KIND_TO_ARTIFACT_TYPE[kind];
      assert.ok(mapped, `输出类型 ${kind} 必须有映射`);
      assert.ok(isResultArtifactType(mapped), `${kind} 应映射为真实成果物类型`);
    }
    assert.equal(Object.keys(OUTPUT_KIND_TO_ARTIFACT_TYPE).length, ALL_OUTPUT_KINDS.length);

    assert.equal(mapOutputKindToArtifactType("DOCUMENT"), "document");
    assert.equal(mapOutputKindToArtifactType("TABLE"), "table");
    assert.equal(mapOutputKindToArtifactType("SCORE"), "score");
    assert.equal(mapOutputKindToArtifactType("TIMELINE"), "timeline");
    assert.equal(mapOutputKindToArtifactType("JSON"), "json");
    assert.equal(mapOutputKindToArtifactType("FILE"), "file");
    assert.equal(mapOutputKindToArtifactType("DOCUMENT_PACKAGE"), "document_package");
  });

  test("禁止把 DOCUMENT 伪装成 prd（无 lowercase 强转、无无关类型）", () => {
    assert.notEqual(mapOutputKindToArtifactType("DOCUMENT"), "prd" as unknown as string);
    // SCORE / TIMELINE 不得降级伪装为 report/json
    assert.notEqual(mapOutputKindToArtifactType("SCORE"), "report");
    assert.notEqual(mapOutputKindToArtifactType("TIMELINE"), "report");
    assert.notEqual(mapOutputKindToArtifactType("TIMELINE"), "json");
  });

  test("未知输出类型明确抛错，绝不猜测", () => {
    assert.throws(
      () => mapOutputKindToArtifactType("SOMETHING_ELSE"),
      (e: unknown) => e instanceof ComponentContractError,
    );
    assert.throws(() => mapOutputKindToArtifactType("document"), (e: unknown) => e instanceof ComponentContractError);
  });

  test("成果物必须包含 id/type/title/mimeType/schemaVersion/content/previewable 完整字段", () => {
    for (const kind of ALL_OUTPUT_KINDS) {
      const artifact = buildResultArtifact({
        outputKind: kind,
        title: "测试成果物",
        content: "正文",
        artifactMime: "text/markdown",
        schemaVersion: "v1",
        rendererType: "MARKDOWN_DOCUMENT",
        previewable: true,
        downloadable: false,
      });
      assert.ok(typeof artifact.id === "string" && artifact.id.startsWith("artifact_"));
      assert.equal(artifact.type, OUTPUT_KIND_TO_ARTIFACT_TYPE[kind]);
      assert.equal(artifact.title, "测试成果物");
      assert.equal(artifact.mimeType, "text/markdown");
      assert.equal(artifact.schemaVersion, "v1");
      assert.equal(artifact.content, "正文");
      assert.equal(artifact.previewable, true);
      assert.equal(artifact.downloadable, false);
      assert.notEqual(artifact.type as unknown as string, "prd");
    }
  });

  test("合同未声明 artifactMime 时按真实类型取默认 MIME，而非伪装", () => {
    const score = buildResultArtifact({ outputKind: "SCORE", title: "评分", content: { score: 90 } });
    assert.equal(score.type, "score");
    assert.equal(score.mimeType, "application/json");
    const doc = buildResultArtifact({ outputKind: "DOCUMENT", title: "文档", content: "md" });
    assert.equal(doc.type, "document");
    assert.equal(doc.mimeType, "text/markdown");
    // 默认 schemaVersion 兜底为 v1
    assert.equal(doc.schemaVersion, "v1");
  });
});
