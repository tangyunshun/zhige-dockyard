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

/** 当前支付模式：显式声明优先；未配置真实凭证时一律降级为模拟（不会偷偷收真钱） */
export function resolvePaymentMode(): PaymentMode {
  const raw = (process.env.PAYMENT_MODE || "").trim().toLowerCase();
  if (raw === "real") {
    return isRealGatewayConfigured() ? "REAL" : "MOCK";
  }
  return "MOCK";
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
export function createCharge(params: CreateChargeParams): CreateChargeResult {
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

  // TODO: 凭证到位后在此接入真实网关（微信支付 native 下单 / 支付宝当面付），
  // 需产出网关支付链接或二维码链接 + 回调验签所需的 platformCertificate。
  // 注意：真实退款必须复用同一网关能力，禁止在管理后台"直接加钱"冒充退款。
  throw new Error(
    `真实支付网关尚未接入（${params.channel}）。请完成网关 SDK 接入后再切换到 PAYMENT_MODE=real。`,
  );
}
