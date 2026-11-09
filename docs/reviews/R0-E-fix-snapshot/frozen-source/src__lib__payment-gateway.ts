/**
 * 支付网关抽象：模拟模式 / 真实网关 双模式。
 *
 * 设计目的：
 *  - 在商户凭证尚未到位时，用【模拟模式】把「下单 → 收银台 → 支付回调 → 入账」整条链路跑通，
 *    便于联调与演示；模拟模式在页面与账面上都明确标注「模拟支付·非真实收款」，绝不伪装成真实收款。
 *  - 凭证到位后只需设置环境变量 PAYMENT_MODE=real 并提供密钥，createCharge 即走真实网关分支，
 *    上层下单/回调/入账业务代码完全不用改。
 *
 * 环境变量约定：
 *  - PAYMENT_MODE=mock | real（默认 mock）
 *  - WECHATPAY_APP_ID / WECHATPAY_MCH_ID / WECHATPAY_API_V3_KEY / WECHATPAY_SERIAL_NO / WECHATPAY_PRIVATE_KEY_PATH
 *  - ALIPAY_APP_ID / ALIPAY_PRIVATE_KEY_PATH / ALIPAY_PUBLIC_KEY_PATH
 *  - PAYMENT_NOTIFY_HOST：公网 HTTPS 回调域名（真实模式必需）
 */
export type PaymentMode = "MOCK" | "REAL";
export type PaymentChannel = "WECHAT_PAY" | "ALIPAY";

/** 当前支付模式：显式声明优先。
 * fail-closed：生产环境未显式配置 PAYMENT_MODE 时按 REAL 处理（真实网关未接入则拒绝下单），
 * 绝不静默降级 MOCK——否则漏配环境变量 = 任何登录用户可零成本给自己无限充值算力点。
 * 仅非生产环境（开发/联调）在未配置时降级为模拟。 */
export function resolvePaymentMode(): PaymentMode {
  const raw = (process.env.PAYMENT_MODE || "").trim().toLowerCase();
  if (raw === "mock") {
    return "MOCK";
  }
  if (raw === "real") {
    // 显式声明 real 但凭证不全：返回 REAL 并由 createCharge 抛错拒绝下单（fail-closed），
    // 绝不静默降级 MOCK——否则声明真实收款却漏配凭证 = 任何登录用户可零成本无限充值。
    return "REAL";
  }
  // 未显式声明：生产环境 fail-closed 按 REAL（真实网关未接入则下单被拒），
  // 仅非生产（开发/联调）降级 MOCK 供充值链路自测。
  return process.env.NODE_ENV === "production" ? "REAL" : "MOCK";
}

/** 真实凭证是否齐备（按渠道分别校验，只需目标渠道齐备即可） */
export function isRealGatewayConfigured(channel?: PaymentChannel): boolean {
  const hasNotifyHost = !!process.env.PAYMENT_NOTIFY_HOST;
  const wx =
    !!process.env.WECHATPAY_APP_ID &&
    !!process.env.WECHATPAY_MCH_ID &&
    !!process.env.WECHATPAY_API_V3_KEY &&
    !!process.env.WECHATPAY_SERIAL_NO &&
    !!process.env.WECHATPAY_PRIVATE_KEY_PATH;
  const ali =
    !!process.env.ALIPAY_APP_ID &&
    !!process.env.ALIPAY_PRIVATE_KEY_PATH &&
    !!process.env.ALIPAY_PUBLIC_KEY_PATH;

  if (channel === "WECHAT_PAY") return wx && !!process.env.PAYMENT_NOTIFY_HOST;
  if (channel === "ALIPAY") return ali && !!process.env.PAYMENT_NOTIFY_HOST;
  return hasNotifyHost && (wx || ali);
}

export interface CreateChargeParams {
  orderNo: string;
  amountCents: number;
  subject: string;
  channel: PaymentChannel;
  /** 支付截止时间（透传给网关做超时关闭，与本地订单生命周期一致） */
  expiresAt?: Date | null;
}

export interface CreateChargeResult {
  mode: PaymentMode;
  channel: PaymentChannel;
  /** 收银台地址：模拟模式为本地模拟页；真实模式为网关支付链接 / 二维码链接 */
  payUrl: string;
  /** 真实网关的原始下单参数（模拟模式为 null） */
  gatewayPayload: unknown | null;
}

/**
 * 创建一笔收款（不会立即入账，入账必须发生在支付回调确认之后）。
 * 这是「不能选完支付方式就加点数」的关键约束：下单与入账彻底分离。
 */
export async function createCharge(params: CreateChargeParams): Promise<CreateChargeResult> {
  const mode = resolvePaymentMode();

  if (mode === "MOCK") {
    // 模拟收银台：明确告知这是模拟环境，点击后调用本地确认接口入账。
    // 路径放在 /user/ 登录保护前缀下，避免被公开路由白名单放行。
    return {
      mode: "MOCK",
      channel: params.channel,
      payUrl: `/user/pay/mock?orderNo=${encodeURIComponent(params.orderNo)}`,
      gatewayPayload: null,
    };
  }

  if (!isRealGatewayConfigured(params.channel)) {
    // 真实模式但凭证不全：宁可拒绝下单，也不降级成假装收款
    throw new Error(
      `已声明 PAYMENT_MODE=real，但 ${params.channel} 的支付凭证或 PAYMENT_NOTIFY_HOST 未配置完整，拒绝创建收款单。`,
    );
  }

  // 真实网关：微信 Native 扫码 / 支付宝电脑网站支付。
  // 下单只拿「收银台载体」（二维码链接 / 官方收银台跳转 URL），绝不入账；入账只发生在验签回调之后。
  if (params.channel === "WECHAT_PAY") {
    const { createNativeOrder } = await import("@/lib/payment/wechatpay");
    const native = await createNativeOrder({
      orderNo: params.orderNo,
      amountCents: params.amountCents,
      description: params.subject,
      expiresAt: params.expiresAt ?? null,
    });
    if (!native.ok || !native.codeUrl) {
      throw new Error(native.error || "微信下单失败");
    }
    // 前端用 /user/pay/qr 页面渲染二维码并轮询订单状态
    return {
      mode: "REAL",
      channel: params.channel,
      payUrl: `/user/pay/qr?orderNo=${encodeURIComponent(params.orderNo)}`,
      gatewayPayload: { codeUrl: native.codeUrl },
    };
  }

  if (params.channel === "ALIPAY") {
    const { buildPagePayUrl } = await import("@/lib/payment/alipay");
    const page = buildPagePayUrl({
      orderNo: params.orderNo,
      amountCents: params.amountCents,
      subject: params.subject,
      expiresAt: params.expiresAt ?? null,
    });
    if (!page.ok || !page.url) {
      throw new Error(page.error || "支付宝下单失败");
    }
    return {
      mode: "REAL",
      channel: params.channel,
      payUrl: page.url,
      gatewayPayload: null,
    };
  }

  throw new Error(
    `真实支付网关尚未支持该渠道（${params.channel}）。`,
  );
}
