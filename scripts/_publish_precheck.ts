import fs from "fs";
import path from "path";
import { prisma } from "../src/lib/prisma";
import { validateComponentContract } from "../src/lib/component-contract/validators";
import { resolveDefaultDeployment } from "../src/lib/model-registry";
import { extractRequiredCapabilities } from "../src/lib/component-contract/capabilities";
import {
  C01_CANDIDATE_1_1_0,
  C02_CANDIDATE_1_1_0,
  C07_CANDIDATE_1_1_0,
} from "./candidates-core3-1.1.0";

function loadEnvFile(p: string) {
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf-8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}

const GATE_WS = "ws-enterprise-1787927954618-9arzol";
const COMPS = [
  { id: "C01", c: C01_CANDIDATE_1_1_0 },
  { id: "C02", c: C02_CANDIDATE_1_1_0 },
  { id: "C07", c: C07_CANDIDATE_1_1_0 },
];

async function main() {
  for (const f of [".env.local", ".env.development.local", ".env"]) loadEnvFile(path.join(process.cwd(), f));
  const out: Array<Record<string, unknown>> = [];
  for (const { id, c } of COMPS) {
    let valid = false, validMsg = "";
    try { validateComponentContract(c); valid = true; } catch (e) { validMsg = (e as Error).message; }
    const reqCaps = extractRequiredCapabilities(c);
    let gateOk = false, gateMsg = "";
    try {
      const plan = await resolveDefaultDeployment({ workspaceId: GATE_WS, requiredCapabilities: reqCaps });
      gateOk = true;
      gateMsg = `${plan.defaultSource}:${plan.providerId}/${plan.modelId}`;
    } catch (e) { gateMsg = (e as Error).message; }
    out.push({ id, valid, validMsg, requiredCapabilities: reqCaps, capabilityGate: gateOk, gateDetail: gateMsg });
  }
  console.log(JSON.stringify({ action: "PUBLISH_READONLY_PRECHECK", items: out }, null, 2));
  await prisma.$disconnect();
}
main().catch((e) => { console.error(String(e)); prisma.$disconnect(); process.exit(2); });
