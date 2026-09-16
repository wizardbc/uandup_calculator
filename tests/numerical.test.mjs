import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import temml from "temml";
import initNumeric, { CalculatorEngine } from "../public/wasm/uandup_engine.js";
import initBraille, {
  mathml_to_braille,
} from "../public/wasm/mathai_accessibility.js";
import { brailleToLatex } from "../src/accessibility/braille.ts";
await initNumeric({
  module_or_path: await readFile(
    new URL("../public/wasm/uandup_engine_bg.wasm", import.meta.url),
  ),
});
await initBraille({
  module_or_path: await readFile(
    new URL("../public/wasm/mathai_accessibility_bg.wasm", import.meta.url),
  ),
});
const engine = new CalculatorEngine();
function calculate(latex) {
  const result = JSON.parse(
    engine.calculate(
      JSON.stringify({
        expressions: [
          { id: "theta", latex: "theta=0.7" },
          { id: "test", latex },
        ],
        scientific: true,
        viewport: {
          xMin: -10,
          xMax: 10,
          yMin: -10,
          yMax: 10,
          width: 800,
          height: 800,
        },
      }),
    ),
  );
  assert.ok(!result.error, result.error);
  assert.ok(!result.rows[1].error, `${latex}: ${result.rows[1].error}`);
  return result.rows[1];
}
const cases = [
  String.raw`\frac{1+2}{3+4}`,
  String.raw`\frac{1}{\frac{2}{3}}`,
  String.raw`\sqrt[3]{8}`,
  String.raw`\sqrt{\sqrt{16}}`,
  String.raw`2^{3+4}`,
  String.raw`2^{3^2}`,
  String.raw`\sin(2)+\cos(3)`,
  String.raw`\log_{2}(8)`,
  String.raw`\left|3-7\right|`,
  String.raw`\frac{1}{2}+\frac{3}{4}`,
  String.raw`\pi+\theta`,
  String.raw`3\le 4`,
  String.raw`3\ge 4`,
  String.raw`3\ne 4`,
  String.raw`[1,2,3]`,
  String.raw`2.3\times 4`,
  String.raw`3\div 4`,
  String.raw`25\%`,
  String.raw`(1,2)`,
  String.raw`\int_{0}^{1}x^2dx`,
  String.raw`\sum_{n=1}^{4}n^2`,
  String.raw`\operatorname{normaldist}(0,1).\operatorname{cdf}(1)`,
];
for (const code of ["Nemeth", "UEB"])
  for (const latex of cases)
    test(`${code} round trip preserves value: ${latex}`, () => {
      const mathml = temml.renderToString(latex, {
        throwOnError: true,
        trust: false,
        maxExpand: 1000,
      });
      const cells = mathml_to_braille(mathml, code);
      const back = brailleToLatex(cells, code);
      const before = calculate(latex),
        after = calculate(back);
      if (before.value !== null)
        assert.ok(
          after.value !== null &&
            Math.abs(before.value - after.value) <=
              1e-10 * (1 + Math.abs(before.value)),
          `${latex} -> ${cells} -> ${back}: ${before.value} != ${after.value}`,
        );
      else assert.equal(after.display, before.display);
    });

const { tableExpressions } = await import("../src/engine/tables.ts");
const models = {
  linear: (x) => 2 * x + 3,
  quadratic: (x) => 0.5 * x * x - 2 * x + 1,
  cubic: (x) => x ** 3 - 2 * x + 1,
  quartic: (x) => x ** 4 - x * x + 2,
  exponential: (x) => 3 * 2 ** x,
  logarithmic: (x) => 2 + 3 * Math.log(x),
  power: (x) => 2 * x ** 1.5,
  logistic: (x) => 10 / (1 + 2 * Math.exp(-0.7 * x)),
  sinusoidal: (x) => 2 * Math.sin(0.7 * x + 0.4) + 1,
};
for (const [model, f] of Object.entries(models))
  test(`table ${model} regression reproduces an analytic dataset`, () => {
    const table = {
      id: "fixture-x",
      type: "table",
      headers: ["a", "y_1"],
      values: Array.from({ length: 16 }, (_, i) => {
        const x = (i + 1) * 0.5;
        return [String(x), String(f(x))];
      }),
      color: "#2d70b3",
      hidden: false,
      regression: {
        model,
        xColumn: 0,
        yColumn: 1,
        color: "#6042a6",
        hidden: false,
        residualVariable: "e_1",
      },
    };
    const rows = tableExpressions(table, [table]);
    const result = JSON.parse(
      engine.calculate(
        JSON.stringify({
          expressions: rows,
          viewport: {
            xMin: 0,
            xMax: 10,
            yMin: -10,
            yMax: 20,
            width: 800,
            height: 800,
          },
        }),
      ),
    );
    assert.ok(!result.error, result.error);
    const row = result.rows.find((r) => r.id === "fixture-x:regression");
    assert.ok(row?.fit, JSON.stringify(row));
    assert.ok(row.fit.rSquared > 1 - 1e-8, JSON.stringify(row.fit));
    assert.ok(row.geometry.length > 0);
  });

for (const [latex, expected] of [
  [String.raw`x^2\operatorname{with}x=3`, 9],
  [String.raw`a=x^2\operatorname{with}x=3`, 9],
  [String.raw`x+y\operatorname{with}x=2,y=3`, 5],
  [String.raw`\operatorname{total}(n^2\operatorname{for}n=[1...4])`, 30],
])
  test(`local binding evaluates ${latex}`, () =>
    assert.equal(calculate(latex).value, expected));
test("assigned comprehension binds its iteration variable", () =>
  assert.equal(
    calculate(String.raw`L=n^2\operatorname{for}n=[1...4]`).display,
    "[1, 4, 9, 16]",
  ));
