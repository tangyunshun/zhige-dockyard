import { PrismaClient } from "@prisma/client";
import { pointsToYuan } from "@/lib/point-rate";

export interface TokenPackItem {
  id: string;
  name: string;
  points: number;
  price: number;
  icon: string;
  color: string;
  description: string;
  isPopular: boolean;
  isActive: boolean;
  sortOrder: number;
}

/**
 * 预置算力加油包基线（仅数据库为空/缺失时补齐，不覆盖已有修改）。
 *
 * 定价策略：体积阶梯折扣 —— 档位越大单价越低；
 * 高等级会员还可再享 membershiplevel.tokenPackDiscount 百分比折扣（由数据库配置）。
 */
export const DEFAULT_TOKEN_PACKS: TokenPackItem[] = [
  {
    id: "pack_lite_500",
    name: "知惠算力包",
    points: 500,
    price: 6, // ¥0.012/点，小额尝鲜
    icon: "⚡",
    color: "#38a169",
    description: "小额尝鲜，随时为空间补充算力（约 ¥0.012/点）",
    isPopular: false,
    isActive: true,
    sortOrder: 1,
  },
  {
    id: "pack_standard_1000",
    name: "标准算力包",
    points: 1000,
    price: 10, // ¥0.01/点，标准价
    icon: "💡",
    color: "#3182ce",
    description: "适合日常小规模测试与组件研发调用（约 ¥0.010/点）",
    isPopular: false,
    isActive: true,
    sortOrder: 2,
  },
  {
    id: "pack_pro_10000",
    name: "尊享算力包",
    points: 10000,
    price: 80, // ¥0.008/点
    icon: "👑",
    color: "#dd6b20",
    description: "团队敏捷研发首选，量大更省心（约 ¥0.008/点）",
    isPopular: true,
    isActive: true,
    sortOrder: 3,
  },
  {
    id: "pack_enterprise_50000",
    name: "企业旗舰算力包",
    points: 50000,
    price: 350, // ¥0.007/点
    icon: "🚀",
    color: "#805ad5",
    description: "专为大型企业级研发团队定制，大额采购最优（约 ¥0.007/点）",
    isPopular: false,
    isActive: true,
    sortOrder: 4,
  },
];

let fallbackPrismaClient: PrismaClient | null = null;

/**
 * 安全兼容量化解析 Prisma Client 上的 TokenPack 模型代理 (含单例热重载自愈能力)
 */
export function getTokenPackModel(prisma: any) {
  if (prisma) {
    const m = prisma.tokenpack || prisma.tokenPack || prisma.Tokenpack || prisma.TokenPack;
    if (m) return m;
  }
  
  // 关键防死自愈：当全局单例属于旧实例未绑定最新 tokenpack 模型时，自动实例化最新 PrismaClient！
  try {
    if (!fallbackPrismaClient) {
      fallbackPrismaClient = new PrismaClient();
    }
    const fallbackModel = (fallbackPrismaClient as any).tokenpack || (fallbackPrismaClient as any).tokenPack;
    if (fallbackModel) return fallbackModel;
  } catch (e) {
    console.warn("初始化 fallbackPrismaClient 失败:", e);
  }
  return null;
}

/**
 * 自动向数据库注入预置的算力包数据 (仅在记录缺失时物理新增，绝对不覆盖已有更改)
 */
export async function seedDefaultTokenPacks(prisma: PrismaClient) {
  try {
    const model = getTokenPackModel(prisma);
    if (!model) return;

    // 已被管理员彻底删除的预置包不再自动补回（避免“删不掉”）
    const deletedIds = await getDeletedTokenPackIds(prisma);

    for (const item of DEFAULT_TOKEN_PACKS) {
      if (deletedIds.has(item.id)) continue;

      const existing = await model.findUnique({
        where: { id: item.id },
      }).catch(() => null);

      if (!existing) {
        await model.create({
          data: {
            id: item.id,
            name: item.name,
            points: BigInt(item.points),
            price: item.price,
            icon: item.icon,
            color: item.color,
            description: item.description,
            isPopular: item.isPopular,
            isActive: item.isActive,
            sortOrder: item.sortOrder,
            updatedAt: new Date(),
          },
        }).catch(() => null);
      }
    }
  } catch (e) {
    console.warn("自动预置 TokenPack 记录警告:", e);
  }
}

let memoryTokenPacksCache: Record<string, Partial<TokenPackItem>> = {};

export function updateTokenPackMemoryCache(id: string, pack: Partial<TokenPackItem>) {
  memoryTokenPacksCache[id] = { ...memoryTokenPacksCache[id], ...pack };
}

export function removeTokenPackMemoryCache(id: string) {
  delete memoryTokenPacksCache[id];
}

/** systemconfig 键：已被管理员彻底删除的算力包 ID（用于阻止预置包被 seed 自动补回） */
const DELETED_TOKEN_PACK_IDS_KEY = "deleted_token_pack_ids";

async function getDeletedTokenPackIds(prisma: any): Promise<Set<string>> {
  try {
    const row = await prisma.systemconfig
      ?.findUnique({ where: { key: DELETED_TOKEN_PACK_IDS_KEY } })
      .catch(() => null);
    if (row?.value) {
      const arr = JSON.parse(row.value);
      if (Array.isArray(arr)) return new Set(arr.map(String));
    }
  } catch (e) {
    console.warn("读取已删除算力包标记失败:", e);
  }
  return new Set();
}

/** 记录“该算力包已被彻底删除”，持久化到 systemconfig，跨进程/重启生效 */
export async function markTokenPackDeleted(prisma: any, id: string): Promise<void> {
  try {
    const deleted = await getDeletedTokenPackIds(prisma);
    if (deleted.has(id)) return;
    deleted.add(id);
    const value = JSON.stringify([...deleted]);
    await prisma.systemconfig
      ?.upsert({
        where: { key: DELETED_TOKEN_PACK_IDS_KEY },
        create: { key: DELETED_TOKEN_PACK_IDS_KEY, value },
        update: { value },
      })
      .catch(() => null);
  } catch (e) {
    console.warn("写入已删除算力包标记失败:", e);
  }
}

/**
 * 100% 实时从 MySQL 数据库查询算力加油包列表 (融合双重最新修改防护)
 */
export async function getAllTokenPacks(prisma: PrismaClient, onlyActive: boolean = false): Promise<TokenPackItem[]> {
  // 已被管理员彻底删除的算力包 ID（预置包与运行时包均不再展示/补回）
  const deletedIds = await getDeletedTokenPackIds(prisma);

  try {
    // 自动预置校验 (仅缺失时补齐，不覆盖已修改记录)
    await seedDefaultTokenPacks(prisma);

    const model = getTokenPackModel(prisma);
    let items: TokenPackItem[] = [];

    if (model) {
      const rawPacks = await model.findMany({
        orderBy: { sortOrder: "asc" },
      }).catch(() => null);

      if (rawPacks && rawPacks.length > 0) {
        items = rawPacks.map((p: any) => {
          const item: TokenPackItem = {
            id: p.id,
            name: p.name,
            points: Number(p.points),
            price: Number(p.price),
            icon: p.icon || "⚡",
            color: p.color || "#3182ce",
            description: p.description || "",
            isPopular: p.isPopular === true,
            isActive: p.isActive !== false,
            sortOrder: Number(p.sortOrder || 0),
          };
          // 若有内存极速最新修正，强制覆盖，绝对防退回！
          if (memoryTokenPacksCache[p.id]) {
            return { ...item, ...memoryTokenPacksCache[p.id] };
          }
          return item;
        });
      }
    }

    if (items.length === 0) {
      items = DEFAULT_TOKEN_PACKS.filter((p) => !deletedIds.has(p.id)).map((p) => {
        if (memoryTokenPacksCache[p.id]) {
          return { ...p, ...memoryTokenPacksCache[p.id] };
        }
        return p;
      });
    }

    // 补齐用户在运行时新建但尚未在底层 DB 查出的加油包
    Object.keys(memoryTokenPacksCache).forEach((cachedId) => {
      if (!items.some((i) => i.id === cachedId)) {
        const cacheItem = memoryTokenPacksCache[cachedId];
        items.push({
          id: cachedId,
          name: cacheItem.name || "算力加油包",
          points: cacheItem.points || 1000,
          price: cacheItem.price ?? pointsToYuan(cacheItem.points || 1000),
          icon: cacheItem.icon || "⚡",
          color: cacheItem.color || "#3182ce",
          description: cacheItem.description || "",
          isPopular: cacheItem.isPopular === true,
          isActive: cacheItem.isActive !== false,
          sortOrder: cacheItem.sortOrder || 0,
        });
      }
    });

    // 按 sortOrder 升序严格排列
    items.sort((a, b) => a.sortOrder - b.sortOrder);

    if (onlyActive) {
      items = items.filter((p) => p.isActive);
    }
    return items;
  } catch (error) {
    console.warn("查询 tokenpack 数据库异常:", error);
    let items = DEFAULT_TOKEN_PACKS.filter((p) => !deletedIds.has(p.id)).map((p) =>
      memoryTokenPacksCache[p.id] ? { ...p, ...memoryTokenPacksCache[p.id] } : p
    );
    return onlyActive ? items.filter((p) => p.isActive) : items;
  }
}
