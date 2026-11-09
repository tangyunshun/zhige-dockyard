// 临时脚本：r0b 按调用块精确补 gatewayTransactionId（订单号派生，保持每订单一致）
const fs = require("fs");
const p = "src/app/api/__tests__/r0b-seat-addon.test.ts";
let lines = fs.readFileSync(p, "utf8").split("\n");
const out = [];
let i = 0;
let idx = 0;
while (i < lines.length) {
  const l = lines[i];
  if (/fulfillPaidOrder\(\{/.test(l)) {
    let block = [l];
    let depth = (l.match(/{/g) || []).length - (l.match(/}/g) || []).length;
    let j = i + 1;
    while (depth > 0 && j < lines.length) {
      block.push(lines[j]);
      depth += (lines[j].match(/{/g) || []).length - (lines[j].match(/}/g) || []).length;
      j++;
    }
    const text = block.join("\n");
    idx++;
    if (
      text.includes('paymentMode: "REAL"') &&
      !text.includes("gatewayTransactionId") &&
      !text.includes("gatewayAmountCents: null") &&
      !text.includes("gatewayAmountCents: 2601")
    ) {
      const orderNoMatch = text.match(/orderNo:\s*"([^"]+)"/);
      const orderNo = orderNoMatch ? orderNoMatch[1] : `blk${idx}`;
      const txLine = block.find((x) => /gatewayAmountCents:/.test(x));
      if (txLine) {
        const indent = (txLine.match(/^\s*/) || [""])[0];
        const txIns = `${indent}gatewayTransactionId: "tx_${orderNo}",`;
        const at = block.indexOf(txLine);
        block.splice(at, 0, txIns);
      }
    }
    out.push(...block);
    i = j;
    continue;
  }
  out.push(l);
  i++;
}
fs.writeFileSync(p, out.join("\n"));
console.log("calls scanned:", idx);
