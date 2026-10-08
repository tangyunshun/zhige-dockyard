import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * 模型部署「启用态冻结」的服务端兜底守卫。
 *
 * 背景：管理后台已将「价格 / 能力」入口在模型启用时隐藏，但绕过页面直接调用 API 仍能改写配置，
 * 会导致正在运行的组件出现「计费单价被偷改」「合约能力与实际不符」两类资金/执行风险。
 * 因此所有会影响运行口径的写操作（定价、时段价格、能力等）都必须经过本守卫：
 * 模型处于启用态时一律以 409 拒绝，要求管理员先停用模型。
 *
 * 说明：「停用」本身（enabled: false）永远放行，否则管理员将无法把模型变更为可编辑状态。
 */

export const DEPLOYMENT_ENABLED_LOCKED_ERROR =
  "模型启用中：请先在管理后台「停用」该模型，再修改价格、时段价格或能力";

/**
 * 查询部署是否处于启用态；启用则返回 409 响应，未启用/不存在返回 null 交由调用方继续。
 */
export async function rejectIfDeploymentEnabled(deploymentId: string): Promise<NextResponse | null> {
  const dep = await prisma.modeldeployment.findUnique({
    where: { id: deploymentId },
    select: { enabled: true },
  });
  if (dep?.enabled) {
    return NextResponse.json(
      { success: false, code: "DEPLOYMENT_ENABLED_LOCKED", error: DEPLOYMENT_ENABLED_LOCKED_ERROR },
      { status: 409 },
    );
  }
  return null;
}
