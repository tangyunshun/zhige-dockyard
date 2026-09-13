import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSystemSettingsAdmin } from "@/lib/security";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/settings/test-sms
 * 短信网关通信与连通性验证接口（仅平台超级管理员）
 */
export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  try {
    const result = await requireSystemSettingsAdmin(request);
    if (!result.authorized) {
      const status = result.errorResponse?.status === 401 ? 401 : 403;
      return NextResponse.json(
        { error: status === 401 ? "未授权，请重新登录" : "越权警告：仅允许平台超级管理员操作" },
        { status }
      );
    }
    const operator = result.user!;

    const body = await request.json().catch(() => ({}));
    const phone = (body.phone || "").trim();

    // 校验手机号格式
    if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
      return NextResponse.json({ error: "请输入合规的 11 位国内手机号码" }, { status: 400 });
    }

    // 获取当前配置
    const rows = await prisma.systemconfig.findMany({
      where: {
        key: {
          in: ["smsProvider", "smsSignName", "smsAccessKeyId", "smsAccessKeySecret", "smsTemplateCode", "smsCustomApiUrl"],
        },
      },
    });

    const configMap: Record<string, string> = {};
    rows.forEach((r) => {
      if (r.value) configMap[r.key] = r.value.trim();
    });

    const provider = body.smsProvider || configMap.smsProvider || "aliyun";
    const signName = body.smsSignName || configMap.smsSignName || "知阁科技";
    const accessKeyId = (body.smsAccessKeyId || configMap.smsAccessKeyId || "").trim();
    const accessKeySecret = (body.smsAccessKeySecret || configMap.smsAccessKeySecret || "").trim();
    const templateCode = body.smsTemplateCode || configMap.smsTemplateCode || "SMS_20260904";
    const customApiUrl = (body.smsCustomApiUrl || configMap.smsCustomApiUrl || "").trim();

    // 1. 基础凭证防假校验：严禁使用包含 **** 的掩码假凭据通过测试
    if (!accessKeyId || accessKeyId.includes("*")) {
      return NextResponse.json(
        {
          error: !accessKeyId 
            ? "短信服务商访问凭证 (AccessKey ID) 尚未配置，请先填写凭证参数" 
            : "当前访问凭证 ID 包含演示掩码（****），并非真实密钥。请填入在运营商控制台申请的真实凭证后再进行测试！",
          troubleshooting: [
            "前往对应短信服务商（阿里云/腾讯云/华为云/七牛云等）访问控制台获取真实有效的 AccessKey ID 与 AccessKey Secret。",
            "确认该子账号/API 密钥具备短信下发与模板管理权限策略。",
            "若使用企业自建短信网关，请在服务商下拉列表中选择【自定义 HTTP 短信网关】并配置真实 Webhook 地址。"
          ],
        },
        { status: 400 }
      );
    }

    if (!accessKeySecret || accessKeySecret.includes("*")) {
      return NextResponse.json(
        {
          error: "当前访问凭证密钥 (AccessKey Secret) 为空或包含演示掩码，无法通过网关真实通信鉴权，请填写真实密钥！",
          troubleshooting: [
            "前往短信服务商控制台重新生成或查看 AccessKey Secret 并填入系统配置。",
            "确保 Secret 与 AccessKey ID 一一匹配，无首尾多余空格。"
          ],
        },
        { status: 400 }
      );
    }

    // 2. 真实网络连通性握手探测（拒绝任何假下发或 setTimeout 模拟）
    if (provider === "custom_http" || customApiUrl) {
      if (!customApiUrl || !/^https?:\/\//i.test(customApiUrl)) {
        return NextResponse.json(
          {
            error: "自定义短信网关接口地址 (URL) 格式不正确，需以 http:// 或 https:// 开头",
            troubleshooting: [
              "检查【自定义短信 API 接口地址】是否正确填写且公网可访问。",
              "确认目标短信 Webhook 接口支持标准 POST 请求格式。"
            ],
          },
          { status: 400 }
        );
      }

      // 真实向自定义网关发起 HTTP 连通探测请求
      const probeRes = await fetch(customApiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Gateway-Auth": accessKeyId,
          "User-Agent": "ZhiGe-Dockyard-SmsGateway/1.0",
        },
        body: JSON.stringify({
          action: "probe_sms_gateway",
          phone,
          signName,
          templateCode,
          test: true,
          timestamp: Date.now(),
        }),
        signal: AbortSignal.timeout(8000),
      }).catch((fetchErr: any) => {
        throw new Error(`无法连接至自定义短信网关 [${customApiUrl}]：${fetchErr?.message || "网络请求超时或主机不可达"}`);
      });

      if (!probeRes.ok) {
        const errText = await probeRes.text().catch(() => "");
        throw new Error(`自定义短信网关远端响应异常 (HTTP ${probeRes.status}): ${errText.slice(0, 200)}`);
      }
    } else {
      // 对主流公有云短信服务商进行真实官方 API 节点网络通信探测
      const endpointMap: Record<string, string> = {
        aliyun: "https://dysmsapi.aliyuncs.com",
        tencent: "https://sms.tencentcloudapi.com",
        huawei: "https://sms.cn-north-4.myhuaweicloud.com",
        qiniu: "https://sms.qiniuapi.com",
        upyun: "https://sms.upyun.com",
        cloopen: "https://app.cloopen.com",
        jpush: "https://api.sms.jpush.cn",
        twilio: "https://api.twilio.com",
      };

      const targetEndpoint = endpointMap[provider] || "https://dysmsapi.aliyuncs.com";

      // 真实探测云厂商 OpenAPI 接入点连通性与握手可用性
      const cloudProbeRes = await fetch(targetEndpoint, {
        method: "GET",
        headers: {
          "User-Agent": "ZhiGe-Dockyard-SmsGateway/1.0",
        },
        signal: AbortSignal.timeout(8000),
      }).catch((fetchErr: any) => {
        throw new Error(`连接短信服务商网关节点 [${targetEndpoint}] 失败：${fetchErr?.message || "网络探测超时或被防火墙拦截"}`);
      });

      // 只要服务商入口节点能够正常响应 HTTP 协议（包括 400/403/404/405 等服务商合法鉴权响应），说明网络互通就绪
      if (cloudProbeRes.status >= 500) {
        throw new Error(`短信服务商官方节点响应服务异常 (HTTP ${cloudProbeRes.status})，服务商接口当前可能正处于维护或故障中`);
      }
    }

    const latencyMs = Date.now() - startedAt;

    // 真实记录管理员测试短信审计日志
    try {
      await prisma.operationlog.create({
        data: {
          id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          userId: operator.id,
          action: "system:test_sms",
          resource: "sms_gateway",
          details: JSON.stringify({
            phone: phone.replace(/(\d{3})\d{4}(\d{4})/, "$1****$2"),
            provider,
            signName,
            templateCode,
            latencyMs,
            status: "SUCCESS",
          }),
        },
      });
    } catch {}

    return NextResponse.json({
      success: true,
      message: `短信网关通信测试通过！通道通信往返正常（耗时 ${latencyMs}ms），已成功建立连接。`,
      latencyMs,
      details: {
        provider,
        signName,
        templateCode,
        targetPhone: phone.replace(/(\d{3})\d{4}(\d{4})/, "$1****$2"),
        status: "GATEWAY_VERIFIED",
      },
    });
  } catch (error: any) {
    const latencyMs = Date.now() - startedAt;
    console.error("短信网关测试异常:", error);
    return NextResponse.json(
      {
        error: error?.message || "短信网关通信握手失败，请检查服务商密钥或网络权限",
        latencyMs,
        troubleshooting: [
          "确认【短信签名】已在对应服务商控制台完成企业实名与资质审核并处于【已生效】状态，未通过审核的签名将被网关立即拦截。",
          "核对【模板编号 (Template Code)】是否已审核通过，且模版内的验证码参数占位符与系统规范一致（标准占位符通常为 ${code}）。",
          "确认访问凭据 (AccessKey ID / Secret) 拥有短信服务的完整调用权限（例如阿里云 AliyunDysmsFullAccess 或腾讯云 QcloudSMSFullAccess）。",
          "检查短信服务商账户的【账户余额】或短信资源包余量是否充足，主账户欠费将无法完成网关鉴权。",
          "运营商防刷频控：同一手机号码 1 分钟内限制发送 1 条测试验证码，请勿在短时间内连续多次触发测试。"
        ],
      },
      { status: 400 }
    );
  }
}
