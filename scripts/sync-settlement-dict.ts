import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SETTLEMENT_CONFIG = {
  errorCodes: {
    MODEL_UPSTREAM_ERROR: "上游模型服务异常",
    INVALID_USAGE_TOKENS: "Token用量参数非法",
    TOKEN_SETTLEMENT_ERROR: "Token结算核心异常",
    SETTLEMENT_FAILED: "任务扣费结算失败",
    RELEASE_FAILED: "预扣释放退还失败",
    HOLD_EXPIRED: "预扣单据超时过期",
    INSUFFICIENT_POINTS: "账户算力余额不足",
    MODEL_TIMEOUT: "模型响应超时中断",
    TASK_WRITE_FAILED: "任务记录落库失败",
    PRICING_SNAPSHOT_MISSING: "模型计费快照缺失",
    UNAUTHORIZED: "未授权访问拒绝",
    INTERNAL_ERROR: "系统内部计算异常",
    ACCOUNTING_RECONCILIATION_REQUIRED: "需人工对账仲裁",
    LIMIT_EXCEEDED: "超出配额限制",
    QUOTA_EXHAUSTED: "空间算力额度耗尽",
  },
  statuses: {
    REQUIRES_REVIEW: {
      label: "待人工复核",
      desc: "高风险挂起与裁决争议单据",
      style: "bg-amber-50 text-amber-700 border-amber-200",
      dot: "bg-amber-500",
    },
    ALL: {
      label: "全部结算单",
      desc: "平台全量真实结算总流水",
      style: "bg-slate-50 text-slate-700 border-slate-200",
      dot: "bg-slate-500",
    },
    SETTLED: {
      label: "已结算",
      desc: "实际消耗已核销完成",
      style: "bg-emerald-50 text-emerald-700 border-emerald-200",
      dot: "bg-emerald-500",
    },
    RELEASED: {
      label: "已全额退款",
      desc: "调用失败已全额原路退还",
      style: "bg-slate-100 text-slate-600 border-slate-200",
      dot: "bg-slate-400",
    },
    HOLD: {
      label: "预扣中",
      desc: "流式生成执行中尚未对账",
      style: "bg-blue-50 text-blue-700 border-blue-200",
      dot: "bg-[#3182ce]",
    },
  },
  actions: {
    RELEASE: "全额退款",
    SETTLE: "按实扣费",
    REFUND: "原路退款",
    SUPPLEMENT: "差额补扣",
    HOLD: "预扣锁定",
  },
  tokens: {
    inputTokens: "输入Tokens (提示词)",
    outputTokens: "输出Tokens (模型补全)",
    cacheReadTokens: "缓存读取Tokens",
    cacheWriteTokens: "缓存写入Tokens",
    prompt: "提示词输入",
    completion: "模型补全输出",
    cache_read: "读取缓存",
    cache_write: "写入缓存",
  },
  words: {
    inputTokens: "输入 Tokens",
    outputTokens: "输出 Tokens",
    cacheReadTokens: "缓存读取 Tokens",
    cacheWriteTokens: "缓存写入 Tokens",
    REFUND: "原路退款",
    RELEASE: "全额退款",
    SETTLE: "按实扣费",
    HOLD: "预扣锁定",
    REQUIRES_REVIEW: "待人工复核",
    SETTLED: "已结算",
    RELEASED: "已全额退款",
    TOKEN_SETTLEMENT_ERROR: "Token结算核心异常",
    INVALID_USAGE_TOKENS: "Token用量参数非法",
    MODEL_UPSTREAM_ERROR: "上游模型服务异常",
  },
};

async function main() {
  console.log("正在同步结算字典配置到数据库 system_config 表...");
  const record = await prisma.systemconfig.upsert({
    where: { key: "settlement_display_dict" },
    create: {
      key: "settlement_display_dict",
      value: JSON.stringify(SETTLEMENT_CONFIG),
    },
    update: {
      value: JSON.stringify(SETTLEMENT_CONFIG),
    },
  });

  console.log("✅ 结算字典配置已成功落库到数据库 system_config 表:", record.key);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error("❌ 结算字典落库失败:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
