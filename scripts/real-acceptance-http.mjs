// 真实 HTTP 黄金链路验收（批次 CORE-3-GOLDEN-PATH-FINAL-CLOSURE）
// 仅发起对正在运行的 Next 服务的真实 HTTP 请求；不 import route.ts、不构造 NextRequest、不伪造 JWT。
// 凭据一律来自环境变量（TEST_ACCOUNT / TEST_PWD），绝不硬编码、绝不回显、绝不落盘。
// 用法：TEST_ACCOUNT=test-01 TEST_PWD='...' node scripts/real-acceptance-http.mjs
const BASE = process.env.ACCEPT_BASE || "http://127.0.0.1:3000";
const WS = process.env.ACCEPT_WS || "ws-enterprise-1787927954618-9arzol";
const ACCOUNT = process.env.TEST_ACCOUNT;
const PASSWORD = process.env.TEST_PWD;

if (!ACCOUNT || !PASSWORD) {
  console.error("MISSING_CREDS: 必须通过环境变量 TEST_ACCOUNT / TEST_PWD 提供登录凭据");
  process.exit(2);
}

const PROMPTS = {
  C01: "招标文件摘要：1. 资格门槛：投标人须具备 ISO9001 与 CMMI3，近三年同类项目不少于 3 个。2. 技术指标：系统并发支持 10000 用户，响应时间<2s，可用性 99.9%。3. 商务条款：合同总价上限 500 万，付款节点按里程碑。4. 交付与验收：6 个月交付，验收包含压力测试与第三方测评。",
  C02: "技术方案概要：本方案面向等保三级系统，采用国密 SM2/SM4 加密，部署于政务云。包含身份认证、访问控制、日志审计、入侵检测模块。密钥由密码机统一托管，满足商用密码应用安全性评估要求。",
  C07: "请基于以下材料，输出一份软件需求规格说明书（SRS），必须严格包含以下六个一级章节标题（一字不差）：\n# 背景与目标\n# 用户与使用场景\n# 功能需求\n# 非功能需求\n# 数据与接口\n# 验收标准\n\n输入材料：某制造企业计划建设智能质检平台。现有产线依赖人工目检，漏检率高、成本高。质检员、产线班长、质量经理需在边缘与云端协同使用。功能：缺陷图像采集、模型推理、缺陷分类、告警推送、报表导出。非功能：推理时延<200ms、识别准确率>99%、支持500路并发、数据不出厂。对接 MES 与工业相机 SDK。验收：试点产线漏检率下降 50%，误检率<1%。",
};

async function login() {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ account: ACCOUNT, password: PASSWORD, rememberMe: true }),
  });
  const j = await r.json();
  if (!j.success || !j.token) {
    console.error("LOGIN_FAIL", r.status, JSON.stringify(j));
    process.exit(2);
  }
  console.log("LOGIN_OK userId=" + (j.user && j.user.id));
  return j.token;
}

async function studioPost(token, body, fileText) {
  let r;
  if (fileText) {
    const fd = new FormData();
    fd.append("action", "simulate");
    fd.append("workspaceId", body.workspaceId);
    fd.append("componentId", body.componentId);
    fd.append("inputSource", JSON.stringify({ sourceType: "file" }));
    fd.append("file", new File([fileText], body.fileName || "input.txt", { type: "text/plain" }));
    r = await fetch(`${BASE}/api/studio`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
      signal: AbortSignal.timeout(600000),
    });
  } else {
    r = await fetch(`${BASE}/api/studio`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(600000),
    });
  }
  const text = await r.text();
  let j = {};
  try { j = JSON.parse(text); } catch {}
  return { status: r.status, json: j };
}

function pickTaskId(j) {
  if (j.taskId) return j.taskId;
  if (j.task && j.task.id) return j.task.id;
  return null;
}

async function taskDetailQuery(token, taskId) {
  const url = `${BASE}/api/studio?action=task_detail&taskId=${encodeURIComponent(taskId)}`;
  const r = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(30000),
  });
  const text = await r.text();
  let j = {};
  try { j = JSON.parse(text); } catch {}
  return { status: r.status, json: j, raw: text };
}

async function main() {
  const token = await login();
  if (process.env.ACCEPT_TASKID) {
    const d = await taskDetailQuery(token, process.env.ACCEPT_TASKID);
    const t = d.json.data || d.json.task || {};
    console.log("TASKDETAIL_HTTP " + d.status);
    console.log("TASKDETAIL_RAW " + d.raw);
    console.log("TASKDETAIL " + JSON.stringify({ status: t.status, errorCode: t.errorCode, refundStatus: t.refundStatus, refundedPoints: t.refundedPoints, chargeAttempted: t.chargeAttempted, hasContractView: !!t.contractView, artifactCount: Array.isArray(t.result && t.result.artifacts) ? t.result.artifacts.length : 0 }));
    return;
  }
  const comps = (process.env.ACCEPT_COMPS || "C01,C02,C07").split(",").map((s) => s.trim()).filter(Boolean);
  const summary = [];
  for (const comp of comps) {
    console.log(`\n=== ${comp} simulate ===`);
    const needsFile = comp === "C01" || comp === "C02";
    const res = needsFile
      ? await studioPost(token, { workspaceId: WS, componentId: comp, fileName: `${comp.toLowerCase()}.txt` }, PROMPTS[comp])
      : await studioPost(token, { action: "simulate", workspaceId: WS, componentId: comp, inputMaterial: PROMPTS[comp] });
    const j = res.json;
    const taskId = pickTaskId(j);
    console.log("HTTP " + res.status);
    console.log("code=" + j.code + " success=" + j.success + " executionMode=" + j.executionMode + " error=" + j.error);
    console.log("taskId=" + taskId);
    console.log("estimatedPoints=" + (j.estimatedPoints ?? (j.task && j.task.estimatedPoints)) + " tokens=" + (j.task && j.task.tokens) + " billingMode=" + j.billingMode);
    let detail = null;
    if (taskId) {
      const d = await taskDetailQuery(token, taskId);
      const dj = d.json;
      const t = dj.data || dj.task || {};
      detail = {
        status: t.status,
        errorCode: t.errorCode,
        refundStatus: t.refundStatus,
        refundedPoints: t.refundedPoints,
        chargeAttempted: t.chargeAttempted,
        hasContractView: !!t.contractView,
        artifactCount: Array.isArray(t.result && t.result.artifacts) ? t.result.artifacts.length : 0,
      };
      console.log("DETAIL_HTTP " + d.status);
      console.log("DETAIL " + JSON.stringify(detail));
    }
    summary.push({ comp, http: res.status, code: j.code, taskId, exec: j.executionMode, detail });
  }

  console.log("\n=== PREFLIGHT C99 (no contract / no assembly) ===");
  const pf = await studioPost(token, {
    action: "simulate",
    workspaceId: WS,
    componentId: "C99",
    inputMaterial: "x",
  });
  console.log("HTTP " + pf.status + " code=" + pf.json.code + " error=" + pf.json.error + " taskId=" + (pickTaskId(pf.json) || "NONE"));

  console.log("\nSUMMARY " + JSON.stringify(summary, null, 2));
  console.log("PREFLIGHT " + JSON.stringify({ http: pf.status, code: pf.json.code, taskId: pickTaskId(pf.json) || "NONE" }));
}

main().catch((e) => {
  console.error("ERR", e && e.message ? e.message : String(e));
  process.exit(2);
});
