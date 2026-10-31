/**
 * Next.js 启动钩子（Instrumentation）
 *
 * 在 Node.js server 启动时注册进程内定时任务。
 * 当前承担「算力分桶到期清零」的每日周期调度（兜底），
 * 与系统级 cron 脚本 scripts/expire-points-cron.ts 互为冗余，确保每日至少清算一次。
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // 全局 BigInt 序列化保护：避免任何路由因 "Do not know how to serialize a BigInt" 而 500。
  // 与各处 Number(...) 转换语义一致（点数 / 额度 / 字节数均在 Number 安全整数范围内）。
  // 一次性注册，覆盖全部 API 路由（会员等级、算力结算、订单、空间配额等）。
  if (typeof (BigInt.prototype as { toJSON?: () => unknown }).toJSON !== "function") {
    (BigInt.prototype as { toJSON?: () => unknown }).toJSON = function (this: bigint) {
      return Number(this);
    };
  }

  // 防止 dev / HMR 下重复注册多个定时器
  const g = globalThis as unknown as { __pointsExpireScheduled?: boolean };
  if (g.__pointsExpireScheduled) return;
  g.__pointsExpireScheduled = true;

  const DAY_MS = 24 * 60 * 60 * 1000;

  const run = async () => {
    try {
      const { expireExpiredGrants } = await import("@/lib/credit-service");
      const cleared = await expireExpiredGrants({});
      console.log(`[points-expire] 每日到期清算完成，清零 ${cleared} 算力点`);
    } catch (e) {
      console.error("[points-expire] 每日到期清算失败:", e);
    }
  };

  // 启动 60s 后首跑（避开启动高峰），之后每 24h 一次
  setTimeout(async () => {
    await run();
    setInterval(run, DAY_MS);
  }, 60 * 1000);

  // 僵尸用户每日扫描：刷新 is_zombie 标记并向超级管理员推送清理提醒。
  // 首跑延后 90s（避开算力清算与启动高峰），之后每 24h 一次；与 scripts/zombie-scan-cron.ts 互为兜底。
  const scanZombies = async () => {
    try {
      const { scanAndNotifyZombies } = await import("@/lib/zombie-user");
      const res = await scanAndNotifyZombies();
      console.log(
        `[zombie-scan] 每日扫描完成，识别 ${res.zombieCount} 个僵尸用户，已通知 ${res.notified} 位超级管理员`
      );
    } catch (e) {
      console.error("[zombie-scan] 每日扫描失败:", e);
    }
  };

  setTimeout(async () => {
    await scanZombies();
    setInterval(scanZombies, DAY_MS);
  }, 90 * 1000);

  // 模型定时禁用扫描：每 10 分钟执行一次（进程内兜底，与外部调度 /api/cron/model-disable-sweep 互为冗余）。
  // 首跑延后 2 分钟（避开启动高峰），之后每 10 分钟一次；processDueModelDisables 内部原子认领，并发安全。
  const sweepModelDisables = async () => {
    try {
      const { processDueModelDisables } = await import("@/lib/model-disable-service");
      const res = await processDueModelDisables();
      if (res.processed > 0) {
        console.log(`[model-disable-sweep] 定时禁用扫描：已生效 ${res.processed} 个计划`);
      }
    } catch (e) {
      console.error("[model-disable-sweep] 定时禁用扫描失败:", e);
    }
  };
  setTimeout(async () => {
    await sweepModelDisables();
    setInterval(sweepModelDisables, 10 * 60 * 1000);
  }, 2 * 60 * 1000);

  // 订单超时清算：每 5 分钟把超时未付的 PENDING 订单置为 EXPIRED（迟到回调一律拒绝入账）。
  // 首跑延后 3 分钟（避开启动高峰），与外部调度冗余。
  const sweepExpiredOrders = async () => {
    try {
      const { expirePendingOrders } = await import("@/lib/order-expiry");
      const res = await expirePendingOrders();
      if (res.expiredCount > 0) {
        console.log(`[order-expiry] 订单超时清算：${res.expiredCount} 笔待支付订单已置为 EXPIRED`);
      }
    } catch (e) {
      console.error("[order-expiry] 订单超时清算失败:", e);
    }
  };
  setTimeout(async () => {
    await sweepExpiredOrders();
    setInterval(sweepExpiredOrders, 5 * 60 * 1000);
  }, 3 * 60 * 1000);

  // 对公充值工单超期清理：每日删除创建时间超过 3 年的工单（数据保留策略）。
  // 首跑延后 120s（避开启动高峰），之后每 24h 一次；与 /api/cron/recharge-order-cleanup 互为冗余。
  const cleanupRechargeOrders = async () => {
    try {
      const { cleanupExpiredRechargeOrders } = await import("@/lib/recharge-order-cleanup");
      const res = await cleanupExpiredRechargeOrders();
      if (res.deletedCount > 0) {
        console.log(`[recharge-order-cleanup] 超期工单清理：已删除 ${res.deletedCount} 笔超过 3 年的对公充值工单`);
      }
    } catch (e) {
      console.error("[recharge-order-cleanup] 超期工单清理失败:", e);
    }
  };
  setTimeout(async () => {
    await cleanupRechargeOrders();
    setInterval(cleanupRechargeOrders, DAY_MS);
  }, 120 * 1000);
}
