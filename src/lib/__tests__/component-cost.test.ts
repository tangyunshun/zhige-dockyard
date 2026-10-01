import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  resolveTokenCostDisplay,
  isValidComponentCost,
  resolveComponentCost,
  selectSingleMaterialFile,
  MAX_SINGLE_MATERIAL_FILES,
} from "../component-cost";

describe("component-cost 展示与校验", () => {
  test("历史任务缺少 tokenCost 时显示 0（绝不显示 5）", () => {
    assert.equal(resolveTokenCostDisplay(undefined), 0);
    assert.equal(resolveTokenCostDisplay(null), 0);
    assert.equal(resolveTokenCostDisplay(0), 0);
    assert.notEqual(resolveTokenCostDisplay(undefined), 5);
    assert.notEqual(resolveTokenCostDisplay(null), 5);
  });

  test("合法成本原样返回", () => {
    assert.equal(resolveTokenCostDisplay(30), 30);
    assert.equal(resolveTokenCostDisplay("12"), 12);
  });

  test("新建组件未配置合法正整数成本 → 不允许保存", () => {
    assert.equal(isValidComponentCost(0), false);
    assert.equal(isValidComponentCost(undefined), false);
    assert.equal(isValidComponentCost(null), false);
    assert.equal(isValidComponentCost(""), false);
    assert.equal(isValidComponentCost("abc"), false);
    assert.equal(isValidComponentCost(-3), false);
    assert.equal(isValidComponentCost(1.5), false);
  });

  test("合法正整数成本 → 允许保存", () => {
    assert.equal(isValidComponentCost(5), true);
    assert.equal(isValidComponentCost("5"), true);
    assert.equal(isValidComponentCost(30), true);
  });

  test("当前阶段单一主材料：文件输入上限为 1", () => {
    assert.equal(MAX_SINGLE_MATERIAL_FILES, 1);
  });
});

describe("服务端 multipart 单文件校验 selectSingleMaterialFile", () => {
  test("0 个文件：ok 且 file 为 null", () => {
    const decision = selectSingleMaterialFile([]);
    assert.equal(decision.ok, true);
    if (decision.ok) assert.equal(decision.file, null);
  });

  test("1 个文件：ok 且返回该文件", () => {
    const f = new File([Buffer.from("x")], "a.txt");
    const decision = selectSingleMaterialFile([f]);
    assert.equal(decision.ok, true);
    if (decision.ok) assert.equal(decision.file, f);
  });

  test("多个文件：拒绝并返回 INPUT_MULTIPLE_NOT_SUPPORTED", () => {
    const files = [
      new File([Buffer.from("a")], "a.txt"),
      new File([Buffer.from("b")], "b.txt"),
    ];
    const decision = selectSingleMaterialFile(files);
    assert.equal(decision.ok, false);
    if (!decision.ok) assert.equal(decision.code, "INPUT_MULTIPLE_NOT_SUPPORTED");
  });
});

describe("组件成本落库决策 resolveComponentCost", () => {
  test("更新仅改 name、未传成本 → 不写入（provided=false），原成本保持不变", () => {
    const decision = resolveComponentCost(undefined, true);
    assert.equal(decision.ok, true);
    if (decision.ok) assert.equal(decision.provided, false);
  });

  test("更新传 0 / 负数 / 小数 / 非法字符串 / 布尔 / 数组 / 对象 → 拒绝(400)", () => {
    for (const bad of [0, -1, 1.5, "abc", NaN, true, false, [5], ["5"], {}]) {
      const decision = resolveComponentCost(bad, true);
      assert.equal(decision.ok, false, `update should reject ${JSON.stringify(bad)}`);
    }
    // null/"" 视为未提供 → 更新时允许（保持原值）
    for (const absent of [null, ""]) {
      const decision = resolveComponentCost(absent, true);
      assert.equal(decision.ok, true, `update with ${String(absent)} should keep original`);
      if (decision.ok) assert.equal(decision.provided, false);
    }
  });

  test("新建缺少成本 → 拒绝(400)", () => {
    assert.equal(resolveComponentCost(undefined, false).ok, false);
    assert.equal(resolveComponentCost(null, false).ok, false);
    assert.equal(resolveComponentCost("", false).ok, false);
    assert.equal(resolveComponentCost(0, false).ok, false);
  });

  test("合法正整数正常保存（新建 / 更新）", () => {
    const created = resolveComponentCost(20, false);
    assert.equal(created.ok, true);
    if (created.ok) {
      assert.equal(created.provided, true);
      assert.equal(created.value, 20);
      assert.equal(typeof created.value, "number");
    }
    const updated = resolveComponentCost("30", true);
    assert.equal(updated.ok, true);
    if (updated.ok) {
      assert.equal(updated.provided, true);
      assert.equal(updated.value, 30);
    }
  });
});

describe("成本类型严格校验 isValidComponentCost（拒绝隐式转换）", () => {
  test("布尔值 true / false 拒绝", () => {
    assert.equal(isValidComponentCost(true), false);
    assert.equal(isValidComponentCost(false), false);
  });

  test("数组 / 对象拒绝", () => {
    assert.equal(isValidComponentCost([5]), false);
    assert.equal(isValidComponentCost(["5"]), false);
    assert.equal(isValidComponentCost([]), false);
    assert.equal(isValidComponentCost({}), false);
    assert.equal(isValidComponentCost({ value: 5 }), false);
  });

  test("空字符串 / 空白字符串拒绝", () => {
    assert.equal(isValidComponentCost(""), false);
    assert.equal(isValidComponentCost("   "), false);
    assert.equal(isValidComponentCost("\t"), false);
  });

  test("小数 / 负数 / 0 / NaN / Infinity 拒绝", () => {
    assert.equal(isValidComponentCost(1.5), false);
    assert.equal(isValidComponentCost(-3), false);
    assert.equal(isValidComponentCost(0), false);
    assert.equal(isValidComponentCost(NaN), false);
    assert.equal(isValidComponentCost(Infinity), false);
    assert.equal(isValidComponentCost(-Infinity), false);
  });

  test("科学计数法 / 十六进制 / 含其他字符字符串拒绝", () => {
    assert.equal(isValidComponentCost("1e2"), false);
    assert.equal(isValidComponentCost("0x10"), false);
    assert.equal(isValidComponentCost("1.5"), false);
    assert.equal(isValidComponentCost("-5"), false);
    assert.equal(isValidComponentCost("5px"), false);
    assert.equal(isValidComponentCost("5 "), false);
    assert.equal(isValidComponentCost(" 5 "), false);
  });

  test("纯十进制正整数（含前导零）通过", () => {
    assert.equal(isValidComponentCost(5), true);
    assert.equal(isValidComponentCost("5"), true);
    assert.equal(isValidComponentCost("05"), true);
    assert.equal(isValidComponentCost("30"), true);
  });
});
