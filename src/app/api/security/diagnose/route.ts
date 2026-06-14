import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    // 尝试认证（非强制，以便游客也能使用安全诊断工具）
    const authHeader = request.headers.get("authorization");
    let userId: string | null = null;
    if (authHeader && authHeader !== "Bearer null" && authHeader !== "Bearer ") {
      try {
        const authResult = await validateUser(authHeader);
        if (authResult.valid) {
          userId = authResult.user?.id || null;
        }
      } catch (e) {
        console.warn("Auth check optional warning during security diagnosis:", e);
      }
    }

    const { envScale, gpuType, isolationLevel, complianceType, dbType } = await request.json();

    // 验证必要参数
    if (!envScale || !gpuType || !isolationLevel || !complianceType || !dbType) {
      return NextResponse.json({ error: "缺少必要的诊断参数" }, { status: 400 });
    }

    // 诊断算法逻辑（服务器端运算）
    let score = 100;
    const risks: string[] = [];
    const recs: string[] = [];

    // 1. GPU / 芯片合规审查
    if (gpuType === "nvidia") {
      score -= 12;
      risks.push("【算力采购风险】使用非信创英伟达 GPU 系列算力卡，面临长周期供应链封锁与高敏感项目采购审核阻碍风险。");
      recs.push("建议逐步将模型推理环境向华为昇腾 Ascend 910B 或寒武纪思元系列国产化算力硬件迁移。");
    } else if (gpuType === "cpu") {
      score -= 5;
      risks.push("【计算效能瓶颈】纯 CPU 本地算力集群在大模型高并发推理时，可能会面临响应时延激增的体验风险。");
      recs.push("针对核心生成式业务，建议配置小规模国产专用大模型硬件加速板卡以分担算力负载。");
    } else {
      recs.push("国产信创 GPU 硬件适配良好：昇腾芯片/思元芯片具备极高的国产适配性与采购合规优势。");
    }

    // 2. 网络物理隔离等级审查
    if (isolationLevel === "vpc") {
      score -= 10;
      risks.push("【网络边界敞口】公有云独立隔离专区 (VPC Sandbox) 虽进行了隔离，但仍依赖公共网络服务层，存在微小的数据流失及远端被动渗透隐患。");
      recs.push("针对高度敏感或国防等密级研发项目，建议迁移至专属物理机房开展 100% 离线物理隔离部署。");
    } else if (isolationLevel === "hybrid") {
      score -= 5;
      risks.push("【安全网关出网风险】混合专网包含数据通路与外网特定安全网关连接，存在配置偏离引发数据外泄的审计风险。");
      recs.push("应确保严格的细粒度单向访问策略，并在网关处启用数据防泄漏 (DLP) 以及深度封包审查过滤。");
    } else {
      recs.push("物理网络隔离符合最高标准：Air-gapped 100% 网闸隔离能够有效防范任何远端指令渗透。");
    }

    // 3. 目标数据库审查
    if (dbType === "traditional") {
      score -= 10;
      risks.push("【关键底层非信创】使用传统开源 MySQL / PostgreSQL，缺少国产异构容灾以及特定安全密匙盾适配，无法通过政务等核心安全合规审核。");
      recs.push("建议在应用层集成达梦 (Dameng DM8) 或人大金仓 (Kingbase ES) 信创版国产化关系型数据库。");
    } else {
      recs.push("信创数据库支持：选用国产信创数据库可实现底层存储级高强度对称加密与国家安全密匙盾硬级配合。");
    }

    // 4. 合规审计审查
    if (complianceType === "none") {
      score -= 8;
      risks.push("【安全审计缺失】未启用等保三级加解密套件或国密标准，企业核心资产和代码在中枢流转时处于明文状态。");
      recs.push("建议在舟坊中央中枢（Core Engine）中全局开启 SM2/3/4 全链路国密加解密与敏感级网络数据流传输。");
    } else if (complianceType === "level3") {
      recs.push("国家三级等保合规：支持全覆盖的安全防护体系与审计日志备份清退设计。");
    } else if (complianceType === "guomi") {
      recs.push("全链路国产密码认证：采用了高标准的国密 SM2/SM3/SM4 算法链，实现数据防篡改与密文存储。");
    }

    // 确保得分介于 10 到 100 之间
    score = Math.max(10, Math.min(100, score));

    // 处理空数据情况
    if (risks.length === 0) {
      risks.push("未检测到明显安全合规隐患！您的私有化架构具备极强的抗物理渗透及抗泄密防护。");
    }
    if (recs.length === 0) {
      recs.push("您的架构设计十分健全，建议继续保持离线内网审计日志定期清退政策。");
    }

    // 如果是登录用户，写入操作日志
    if (userId) {
      try {
        await prisma.operationlog.create({
          data: {
            id: `oplog-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
            userId,
            action: "SECURITY_DIAGNOSIS",
            resource: "Security",
            details: `Calculated safety score: ${score} (scale=${envScale}, isolation=${isolationLevel}, compliance=${complianceType})`,
          },
        });
      } catch (logError) {
        console.error("Failed to write operation log for security diagnosis:", logError);
      }
    }

    return NextResponse.json({
      success: true,
      score,
      risks,
      recs,
    });
  } catch (error) {
    console.error("Security diagnose API error:", error);
    return NextResponse.json({ error: "安全诊断发生内部错误" }, { status: 500 });
  }
}
