import { PrismaClient } from "@prisma/client";
import { readdirSync, readFileSync } from "fs";
import path from "path";

const prisma = new PrismaClient();
const DOCS_DIR = path.join(__dirname, "docs-content");

interface ParsedDoc {
  title: string;
  category: string;
  sortOrder: number;
  summary?: string;
  tags?: string;
  codeSample?: string;
  content: string;
}

/**
 * 极简 frontmatter 解析器（不依赖第三方库）：
 * - 首行须为 `---`，遇到第二个 `---` 结束元数据；
 * - 支持标量字段 `key: value`；
 * - 支持多行块字段 `codeSample: |` / `codeSample: >-` / `codeSample:`（空值），
 *   其后所有「缩进行」收集为代码内容，自动按最小缩进去缩进。
 */
function parseDoc(raw: string): ParsedDoc | null {
  const lines = raw.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") return null;

  const meta: Record<string, string> = {};
  let i = 1;

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "---") {
      i++;
      break;
    }
    const m = line.match(/^([A-Za-z][\w-]*):\s?([\s\S]*)$/);
    if (m) {
      const key = m[1];
      const val = m[2];
      const v = val.trim();
      const isBlockIndicator = key === "codeSample" && (v === "" || v === "|" || v === ">-" || v === ">");
      if (isBlockIndicator) {
        const block: string[] = [];
        i++;
        while (i < lines.length) {
          const l = lines[i];
          if (l.trim() === "---") break;
          // 块内容以缩进行存在；遇到列 0 的非空行即结束
          if (!l.startsWith(" ") && !l.startsWith("\t") && l.trim() !== "") break;
          block.push(l);
          i++;
        }
        const indents = block
          .filter((l) => l.trim() !== "")
          .map((l) => l.length - l.trimStart().length);
        const min = indents.length ? Math.min(...indents) : 0;
        meta.codeSample = block.map((l) => l.slice(min)).join("\n");
        continue;
      }
      meta[key] = val;
    }
    i++;
  }

  const content = lines.slice(i).join("\n").replace(/^\n+/, "").trim();
  const title = (meta.title || "").trim();
  const category = (meta.category || "").trim();
  if (!title || !category) return null;

  return {
    title,
    category,
    sortOrder: Number(meta.sortOrder) || 0,
    summary: meta.summary?.trim() || undefined,
    tags: meta.tags?.trim() || undefined,
    codeSample: meta.codeSample?.trim() || undefined,
    content,
  };
}

async function main() {
  console.log("🌱 开始播种文档中心全量内容 (DOC-CONTENT)...");

  const admin = await prisma.user.findFirst({
    where: { role: "superadmin" },
    orderBy: { createdAt: "asc" },
  });
  const authorId = admin?.id ?? null;
  console.log(
    authorId
      ? `   作者（超管）: ${admin!.email}`
      : "   ⚠ 未找到超管账号，authorId 置空（可在后台手动指定）",
  );

  const files = readdirSync(DOCS_DIR)
    .filter((f) => f.endsWith(".md"))
    .sort();

  let ok = 0;
  for (const file of files) {
    const raw = readFileSync(path.join(DOCS_DIR, file), "utf-8");
    const doc = parseDoc(raw);
    if (!doc) {
      console.warn(`⚠ 跳过无法解析的文件: ${file}`);
      continue;
    }

    const base = {
      title: doc.title,
      category: doc.category,
      sortOrder: doc.sortOrder,
      summary: doc.summary ?? null,
      tags: doc.tags ?? null,
      codeSample: doc.codeSample ?? null,
      content: doc.content || "",
      isPublished: true,
      visibility: "PUBLIC",
      authorId,
      updatedAt: new Date(),
    };

    // 幂等 upsert：唯一键为 (title, category)；若新标题撞上旧 id（改标题场景），
    // 回退为按 id 更新，保证"一份最新文档"始终就地更新而非重复创建。
    try {
      await prisma.systemdocument.upsert({
        where: { title_category: { title: doc.title, category: doc.category } },
        create: {
          id: `doc_${doc.category}_${doc.sortOrder}`,
          ...base,
          createdAt: new Date(),
          viewCount: 0,
        },
        update: base,
      });
    } catch (e) {
      if ((e as { code?: string }).code === "P2002") {
        await prisma.systemdocument.update({
          where: { id: `doc_${doc.category}_${doc.sortOrder}` },
          data: base,
        });
      } else {
        throw e;
      }
    }

    ok++;
    console.log(
      `✓ [${doc.category}] ${doc.title}（sortOrder=${doc.sortOrder}${doc.codeSample ? "，含代码示例" : ""}）`,
    );
  }

  const total = await prisma.systemdocument.count();
  console.log(`🎉 文档中心播种完成，本次写入/更新 ${ok} 篇；全库 systemdocument 共 ${total} 篇。`);
}

main()
  .catch((e) => {
    console.error("❌ seed-docs-center 执行失败:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
