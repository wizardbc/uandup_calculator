import { test, expect, type Page } from "@playwright/test";
async function inputs(page: Page, latex: string[], complex = false) {
  await page.evaluate(
    ({ latex, complex }) => {
      const s = window.MathAICalculator.getState();
      s.graph.settings.complex = complex;
      s.graph.items = latex.map((latex, i) => ({
        id: `parity-${i}`,
        type: "expression",
        latex,
        color: "#c74440",
        hidden: false,
      }));
      window.MathAICalculator.setState(s);
    },
    { latex, complex },
  );
}
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(
    () => window.MathAICalculator?.getDiagnostics().ready,
  );
});
test("MathAI branding uses the supplied logo and retains the existing embed API", async ({
  page,
}) => {
  await expect(page).toHaveTitle("MathAI Calculator");
  expect(
    await page
      .locator(".wordmark img")
      .evaluate((e: HTMLImageElement) => e.complete && e.naturalWidth > 0),
  ).toBeTruthy();
  expect(
    await page.evaluate(
      () => window.MathAICalculator === window.UandupCalculator,
    ),
  ).toBeTruthy();
});
test("complex mode evaluates roots, powers, conjugates and complex lists", async ({
  page,
}) => {
  await inputs(
    page,
    [
      "\\sqrt{-4}",
      "i^2",
      "(1+i)^2",
      "\\operatorname{conj}(3+4i)",
      "\\operatorname{abs}(3+4i)",
    ],
    true,
  );
  for (const value of ["2i", "-1", "2i", "3 − 4i", "5"])
    await expect(
      page.getByLabel(`Result ${value}`, { exact: true }).first(),
    ).toBeVisible();
  await page
    .getByRole("button", { name: "Graph Settings", exact: true })
    .click();
  await page
    .getByRole("checkbox", { name: "Complex Mode", exact: true })
    .click();
  await expect(
    page.getByLabel("Result undefined", { exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => window.MathAICalculator.getState().graph.settings.complex,
      ),
    )
    .toBe(false);
});
test("z test wizard uses the same summary statistics signature and computes intervals", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Add Item", exact: true }).click();
  await page.getByRole("button", { name: /inference$/ }).click();
  await page.locator(".inference-choices button").nth(1).click();
  await page.getByRole("button", { name: "Stats", exact: true }).click();
  for (const [label, value] of [
    ["sample size", "25"],
    ["mean", "12"],
    ["pop stdev", "3"],
  ]) {
    await page
      .getByRole("textbox", { name: new RegExp(`^Sample 1 ${label}:?$`) })
      .focus();
    await page.keyboard.type(value);
  }
  await page.getByRole("button", { name: "Create Test", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() => window.MathAICalculator.getState().graph.items[0]),
    )
    .toMatchObject({ latex: "\\operatorname{ztest}(25,12,3)" });
  await page.getByRole("button", { name: /Confidence Interval$/ }).click();
  await expect(
    page.getByLabel("Confidence interval 10.824 to 13.176"),
  ).toBeVisible();
  await page.getByRole("button", { name: /Hypothesis Test$/ }).click();
  await expect(page.locator(".test-statistics")).toContainText("p-value");
  await page.getByRole("textbox", { name: /^Null hypothesis:/ }).focus();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("12");
  await expect(page.locator(".test-statistics")).toContainText("=1");
});
test("inference dot access and chi-square expected counts agree with known results", async ({
  page,
}) => {
  await inputs(page, [
    "T=\\operatorname{ttest}([1,2,3])",
    "T.\\operatorname{null}(1).\\operatorname{p}",
    "C=\\operatorname{chisqgof}([30,20,25,25])",
    "C.\\operatorname{score}",
  ]);
  await expect(
    page.getByLabel("Result 0.225403330759", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Result 2", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Observed \(Expected\)$/ }).click();
  await expect(page.locator(".observed-table")).toContainText("(25)");
  await page.getByLabel("Contributions", { exact: true }).check();
  await page.getByLabel("Totals", { exact: true }).check();
  await expect(page.locator(".observed-table tr").last()).toContainText("100");
});
test("logarithmic axes plot without engine errors and viewport lock blocks gestures", async ({
  page,
}) => {
  await inputs(page, ["y=x^2"]);
  await page
    .getByRole("button", { name: "Graph Settings", exact: true })
    .click();
  await page.getByRole("button", { name: /More Options/ }).click();
  await page
    .getByRole("button", { name: "X axis logarithmic", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Y axis logarithmic", exact: true })
    .click();
  await page.getByLabel("Lock Viewport", { exact: true }).check();
  await page
    .getByRole("button", { name: "Graph Settings", exact: true })
    .click();
  const before = await page.evaluate(
    () => window.MathAICalculator.getState().graph.viewport,
  );
  await page.mouse.move(800, 400);
  await page.mouse.wheel(0, 150);
  await page.mouse.down();
  await page.mouse.move(850, 460);
  await page.mouse.up();
  expect(
    await page.evaluate(
      () => window.MathAICalculator.getState().graph.viewport,
    ),
  ).toEqual(before);
  await expect(
    page.getByRole("button", { name: "Zoom In", exact: true }),
  ).toBeDisabled();
  expect(
    await page.evaluate(() => window.MathAICalculator.getDiagnostics().error),
  ).toBeNull();
});
test("Nemeth and UEB preserve expressions and six-key input calculates", async ({
  page,
}) => {
  await inputs(page, ["1+1"]);
  await page
    .getByRole("button", { name: "Graph Settings", exact: true })
    .click();
  await page.getByLabel("Braille Mode", { exact: true }).check();
  const nemeth = page.getByRole("textbox", {
    name: "Expression 1 (Nemeth Braille)",
    exact: true,
  });
  await expect(nemeth).toHaveValue("⠼⠂⠬⠂");
  await nemeth.fill("⠼⠆⠬⠒");
  await expect(page.getByLabel("Result 5", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Graph Settings", exact: true })
    .click();
  await page.getByRole("button", { name: "UEB", exact: true }).click();
  const ueb = page.getByRole("textbox", {
    name: "Expression 1 (UEB Braille)",
    exact: true,
  });
  await expect(ueb).toHaveValue("⠼⠃⠐⠖⠼⠉");
  await page.getByRole("button", { name: "Nemeth", exact: true }).click();
  await page.getByLabel("Six Key Braille Input", { exact: true }).check();
  await nemeth.fill("");
  await nemeth.focus();
  // Hold the next frame so a cursor update cannot silently cancel a newer
  // selection. This also covers the timing that occurs on busy browsers.
  await page.evaluate(() => {
    const nativeFrame = window.requestAnimationFrame;
    const queued: FrameRequestCallback[] = [];
    window.requestAnimationFrame = (callback) => {
      queued.push(callback);
      return -queued.length;
    };
    (window as any).releaseBrailleFrame = () => {
      window.requestAnimationFrame = nativeFrame;
      for (const callback of queued) callback(performance.now());
    };
  });
  await page.keyboard.down("d");
  await page.keyboard.down("s");
  await page.keyboard.up("d");
  await page.keyboard.up("s");
  await expect(nemeth).toHaveValue("⠆");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const r = window.MathAICalculator.getState().graph.items[0];
        return r.type === "expression" ? r.latex : "";
      }),
    )
    .toBe("2");
  await nemeth.evaluate((element: HTMLInputElement) => element.select());
  await page.evaluate(() => (window as any).releaseBrailleFrame());
  await page.keyboard.insertText("⠆⠬⠂");
  await expect(nemeth).toHaveValue("⠆⠬⠂");
  await expect(page.getByLabel("Result 3", { exact: true })).toBeVisible();
});
test("list comprehension, stable uniqueness, keyed sorting and statistics summary", async ({
  page,
}) => {
  await inputs(page, [
    "[x^2\\operatorname{for}x=[1...4]]",
    "\\operatorname{unique}([3,1,3,2,1])",
    "\\operatorname{sort}([10,20,30],[3,1,2])",
    "\\operatorname{stats}([1,2,3,4])",
  ]);
  for (const result of ["[1, 4, 9, 16]", "[3, 1, 2]", "[20, 30, 10]"])
    await expect(
      page.getByLabel(`Result ${result}`, { exact: true }),
    ).toBeVisible();
  await expect(page.locator(".statistics-table")).toContainText("1.290994");
  await page.getByRole("button", { name: /Five Number Summary/ }).click();
  await expect(page.locator(".statistics-table").last()).toContainText(
    "First Quartile",
  );
  await page.getByRole("button", { name: "Export Mean", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.MathAICalculator.getState().graph.items.some(
          (r) => r.type === "expression" && r.latex === "2.5",
        ),
      ),
    )
    .toBe(true);
});
test("probability controls shade the selected region and invert cumulative probability", async ({
  page,
}) => {
  await inputs(page, ["\\operatorname{normaldist}(0,1)"]);
  await page.getByRole("button", { name: /Cumulative Probability$/ }).click();
  await expect(
    page.getByRole("button", { name: "Probability 0.683", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Left", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Probability 0.841", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Bounds", exact: true }).click();
  const probability = page.getByRole("textbox", {
    name: /^Cumulative Probability:/,
  });
  await probability.focus();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("0.975");
  await expect(page.locator(".probability-expression")).toContainText(
    "1.959964",
  );
  await page.getByRole("button", { name: /^Summary$/ }).click();
  await expect(page.locator(".distribution-summary")).toContainText("Variance");
});
test("statistical plots have working display properties and seeded samples change on randomize", async ({
  page,
}) => {
  await inputs(page, [
    "\\operatorname{histogram}([1,2,2,3,4])",
    "\\operatorname{boxplot}([1,2,3,4,20])",
    "a=\\operatorname{random}(4,1)",
    "a",
  ]);
  await expect(page.locator(".visualization-result")).toHaveCount(2);
  await page.getByRole("button", { name: "Density", exact: true }).click();
  await page.getByLabel("Show Outliers as Dots", { exact: true }).uncheck();
  const samples = await page.locator(".expression-result").last().textContent();
  await expect(page.locator(".expression-result").first()).toHaveText(
    samples ?? "",
  );
  await page.getByRole("button", { name: "Randomize", exact: true }).click();
  await expect(page.locator(".expression-result").last()).not.toHaveText(
    samples ?? "",
  );
  expect(
    await page.evaluate(() => window.MathAICalculator.getDiagnostics().error),
  ).toBeNull();
});
test("custom colors follow their variable and tones start muted", async ({
  page,
}) => {
  await inputs(page, [
    "c=\\operatorname{rgb}(255,0,0)",
    "y=x",
    "\\operatorname{tone}(440)",
  ]);
  await page
    .getByRole("button", { name: "Hide graph 2", exact: true })
    .click({ button: "right" });
  await page.getByRole("button", { name: "Color c", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const i = window.MathAICalculator.getState().graph.items[1];
        return i.type === "expression" ? i.colorLatex : null;
      }),
    )
    .toBe("c");
  await expect(
    page.getByRole("button", { name: "Unmute All", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Unmute All", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Mute All", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Mute All", exact: true }).click();
});
test("full function menu inserts templates in the expected editing position", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Show Keypad", exact: true }).click();
  await page.getByRole("button", { name: "Functions", exact: true }).click();
  for (const title of [
    "INFERENCE",
    "VISUALIZATIONS",
    "GEOMETRY",
    "CUSTOM COLORS",
    "SOUND",
  ])
    await expect(
      page.locator(".functions-popover h3").filter({ hasText: title }),
    ).toHaveCount(1);
  await page.getByRole("button", { name: "Log A", exact: true }).click();
  await page.keyboard.type("2");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.type("8");
  await expect(page.getByLabel("Result 3", { exact: true })).toBeVisible();
});

test("curve domains edit independently and a radius variable remains a number", async ({
  page,
}) => {
  await inputs(page, [
    "r=2",
    "x^2+y^2=r^2",
    "(\\cos(t),\\sin(t))",
    "r=\\theta",
  ]);
  await expect(
    page.getByRole("slider", { name: "Slider r", exact: true }),
  ).toBeVisible();
  const upper = page.getByRole("textbox", { name: /^domain t Maximum/ });
  await upper.focus();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("2pi");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const row = window.MathAICalculator.getState().graph.items[2];
        return row.type === "expression" ? row.domainMax : "";
      }),
    )
    .toContain("pi");
  await page.getByRole("textbox", { name: /^domain theta Maximum/ }).focus();
  await expect(
    page.getByRole("textbox", { name: /^domain theta Maximum/ }),
  ).toBeFocused();
  await expect(page.locator(".expression-error")).toHaveCount(0);
});
test("point style, dynamic labels and dragging update the graph and variable definitions", async ({
  page,
}) => {
  await inputs(page, ["a=1", "b=2", "(a,b)"]);
  const icon = page.getByRole("button", { name: "Hide graph 3", exact: true });
  await icon.hover();
  await page.mouse.down();
  await page.waitForTimeout(650);
  await page.mouse.up();
  const menu = page.getByRole("dialog", {
    name: "Expression style",
    exact: true,
  });
  await expect(menu).toBeVisible();
  expect(
    await page.evaluate(
      () => window.MathAICalculator.getState().graph.items[2].hidden,
    ),
  ).toBe(false);
  await menu
    .getByRole("button", { name: "Point style diamond", exact: true })
    .click();
  await menu
    .getByRole("checkbox", { name: "Point outline", exact: true })
    .check();
  await menu
    .getByRole("checkbox", { name: "Label visible", exact: true })
    .click();
  await page.keyboard.press("Escape");
  await page
    .getByRole("textbox", { name: "Point label", exact: true })
    .fill("A = ${a}");
  await expect(page.locator(".point-graph-label")).toHaveText("A = 1");
  const box = await page.locator(".graph-canvas canvas").boundingBox();
  const view = await page.evaluate(
    () => window.MathAICalculator.getState().graph.viewport,
  );
  const x =
    box!.x + ((1 - view.xMin) / (view.xMax - view.xMin)) * view.width + 0.5;
  const y =
    box!.y + ((view.yMax - 2) / (view.yMax - view.yMin)) * view.height + 0.5;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 43, y - 43, { steps: 6 });
  await page.mouse.up();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const row = window.MathAICalculator.getState().graph.items[0];
        return row.type === "expression" ? Number(row.latex.split("=")[1]) : 0;
      }),
    )
    .toBeGreaterThan(1.8);
  await expect(page.locator(".point-graph-label")).not.toHaveText("A = 1");
  expect(
    await page.evaluate(
      () => window.MathAICalculator.getState().graph.viewport,
    ),
  ).toEqual(view);
});

test("computed table columns and regression models recalculate and expose residuals", async ({
  page,
}) => {
  await page.evaluate(() => {
    const s = window.MathAICalculator.getState();
    s.graph.items = [
      {
        id: "defined-m",
        type: "expression",
        latex: "m=99",
        color: "#c74440",
        hidden: false,
      },
      {
        id: "data",
        type: "table",
        color: "#2d70b3",
        hidden: false,
        headers: ["x_1", "y_1", "2x_1"],
        values: [
          ["1", "2", ""],
          ["2", "4", ""],
          ["3", "6", ""],
          ["4", "8", ""],
          ["", "", ""],
        ],
      },
    ];
    window.MathAICalculator.setState(s);
  });
  await expect(
    page.getByLabel("Table row 3 column 3: 6", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Add Regression", exact: true })
    .click();
  await expect(page.locator(".regression-equation")).toContainText("y=2x");
  await expect(page.locator(".table-fit-bottom")).toContainText("R2=1");
  await page
    .getByRole("button", { name: "Linear Regression", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Quadratic Regression", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Quadratic Regression", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "plot", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.MathAICalculator.getState().graph.items.some(
          (i) => i.type === "expression" && i.latex === "(x_1,e_{1})",
        ),
      ),
    )
    .toBe(true);
  await expect(page.locator(".expression-error")).toHaveCount(0);
});
test("audio trace has persistent navigation, playback, volume and descriptions", async ({
  page,
}) => {
  await inputs(page, ["y=x^2", "y=x"]);
  await page.getByRole("textbox", { name: /^Expression 1(:|$)/ }).focus();
  await page.keyboard.press("Alt+t");
  const panel = page.getByRole("region", { name: "Audio Trace", exact: true });
  await expect(panel).toBeVisible();
  await page.getByRole("button", { name: "Volume Up", exact: true }).click();
  await expect(panel).toContainText("55%");
  await page.getByRole("button", { name: "Hear Graph", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Stop", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await page.getByRole("button", { name: "Next Curve", exact: true }).click();
  await page
    .getByRole("button", { name: "describe-curve", exact: true })
    .click();
  await expect(panel.getByRole("status")).toContainText("y=x");
  await page.getByRole("button", { name: "Next Point", exact: true }).click();
  await expect(page.locator(".coordinate-label")).toBeVisible();
  await page
    .getByRole("button", { name: "audio-trace-off", exact: true })
    .click();
  await expect(panel).toHaveCount(0);
});

test("list previews expand inline and slider bounds accept expressions", async ({
  page,
}) => {
  await inputs(page, ["[1,2,3]", "[1...30]", "a=99"]);
  await expect(
    page.getByRole("button", { name: "3 element list", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "30 element list", exact: true })
    .click();
  await expect(page.locator(".list-result.expanded .list-value")).toHaveCount(
    30,
  );
  const slider = page.getByRole("slider", { name: "Slider a", exact: true });
  await expect(slider).toHaveAttribute("max", "99");
  await page
    .getByRole("button", { name: "Slider maximum", exact: true })
    .click();
  const maximum = page.getByRole("textbox", { name: /^Slider Maximum:/ });
  await maximum.focus();
  await page.keyboard.type("100pi");
  await page.getByRole("textbox", { name: /^Expression 1(:|$)/ }).focus();
  await expect(slider).toHaveAttribute("max", String(100 * Math.PI));
  await page
    .getByRole("button", { name: "Animation properties", exact: true })
    .click();
  await page.getByRole("radio", { name: "Play once", exact: true }).click();
  await page
    .getByRole("button", { name: "Animate Faster", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Animation properties", exact: true }),
  ).toContainText("1.5x");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Play slider", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const row = window.MathAICalculator.getState().graph.items[2];
        return row.type === "expression" ? row.latex : "";
      }),
    )
    .not.toBe("a=99");
  await page.getByRole("button", { name: "Pause slider", exact: true }).click();
});

test("custom regression residuals and slope inference update from data", async ({
  page,
}) => {
  await inputs(page, [
    "x_1=[1,2,3,4,5]",
    "y_1=[2,4,5,4,5]",
    "y_1~mx_1+b",
    "T=\\operatorname{ttest}(m)",
    "T.\\operatorname{stderr}",
    "T.\\operatorname{dof}",
  ]);
  await expect(
    page.getByLabel("Result 0.282842712475", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Result 3", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Plot residuals", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.MathAICalculator.getState().graph.items.some(
          (i) => i.type === "expression" && i.latex.includes("e_{1}"),
        ),
      ),
    )
    .toBe(true);
  await expect(page.locator(".expression-error")).toHaveCount(0);
});

test("table column styles connect points and dragging writes the selected data pair", async ({
  page,
}) => {
  await page.evaluate(() => {
    const s = window.MathAICalculator.getState();
    s.graph.items = [
      {
        id: "drag-data",
        type: "table",
        color: "#2d70b3",
        hidden: false,
        headers: ["x_1", "y_1"],
        values: [
          ["1", "2"],
          ["2", "4"],
          ["3", "6"],
          ["", ""],
        ],
      },
    ];
    window.MathAICalculator.setState(s);
  });
  const icon = page.getByRole("button", {
    name: "Toggle table points",
    exact: true,
  });
  await icon.hover();
  await page.mouse.down();
  await page.waitForTimeout(650);
  await page.mouse.up();
  const menu = page.getByRole("dialog", {
    name: "Expression style",
    exact: true,
  });
  await menu
    .getByRole("checkbox", { name: "Lines visible", exact: true })
    .check();
  await menu
    .getByRole("checkbox", { name: "Drag Enabled", exact: true })
    .check();
  await menu.getByRole("button", { name: "Drag y only", exact: true }).click();
  await page.keyboard.press("Escape");
  const box = await page.locator(".graph-canvas canvas").boundingBox();
  const v = await page.evaluate(
    () => window.MathAICalculator.getState().graph.viewport,
  );
  const x = box!.x + ((2 - v.xMin) / (v.xMax - v.xMin)) * v.width + 0.5,
    y = box!.y + ((v.yMax - 4) / (v.yMax - v.yMin)) * v.height + 0.5;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 43, y - 43, { steps: 5 });
  await page.mouse.up();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const row = window.MathAICalculator.getState().graph.items[0];
        return row.type === "table" ? Number(row.values[1][1]) : 0;
      }),
    )
    .toBeGreaterThan(4.8);
  expect(
    await page.evaluate(() => {
      const row = window.MathAICalculator.getState().graph.items[0];
      return row.type === "table" ? row.values[1][0] : "";
    }),
  ).toBe("2");
  await expect(page.locator(".expression-error")).toHaveCount(0);
});

test("dragging the second literal point preserves the first point", async ({
  page,
}) => {
  await inputs(page, ["[(1,2),(3,4)]"]);
  await page
    .getByRole("button", { name: "Hide graph 1", exact: true })
    .click({ button: "right" });
  await page
    .getByRole("checkbox", { name: "Drag Enabled", exact: true })
    .check();
  await page.keyboard.press("Escape");
  const box = await page.locator(".graph-canvas canvas").boundingBox();
  const v = await page.evaluate(
    () => window.MathAICalculator.getState().graph.viewport,
  );
  const x = box!.x + ((3 - v.xMin) / (v.xMax - v.xMin)) * v.width + 0.5,
    y = box!.y + ((v.yMax - 4) / (v.yMax - v.yMin)) * v.height + 0.5;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 43, y - 43, { steps: 5 });
  await page.mouse.up();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const i = window.MathAICalculator.getState().graph.items[0];
        return i.type === "expression" ? i.latex : "";
      }),
    )
    .not.toBe("[(1,2),(3,4)]");
  expect(
    await page.evaluate(() => {
      const i = window.MathAICalculator.getState().graph.items[0];
      return i.type === "expression" ? i.latex : "";
    }),
  ).toMatch(/^\[\(1,2\),/);
  await expect(page.locator(".expression-error")).toHaveCount(0);
});

test("axis expressions stay linked to variables until the viewport is moved", async ({
  page,
}) => {
  await inputs(page, ["a=4", "y=x"]);
  await page
    .getByRole("button", { name: "Graph Settings", exact: true })
    .click();
  const maximum = page.getByRole("textbox", { name: /^X axis maximum/ });
  await maximum.focus();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("a");
  await page.getByRole("textbox", { name: /^Y axis minimum/ }).focus();
  await expect
    .poll(() =>
      page.evaluate(
        () => window.MathAICalculator.getState().graph.viewport.xMax,
      ),
    )
    .toBe(4);
  await page
    .getByRole("button", { name: "Graph Settings", exact: true })
    .click();
  await page.evaluate(() => {
    const s = window.MathAICalculator.getState();
    (s.graph.items[0] as { latex: string }).latex = "a=6";
    window.MathAICalculator.setState(s);
  });
  await expect
    .poll(() =>
      page.evaluate(
        () => window.MathAICalculator.getState().graph.viewport.xMax,
      ),
    )
    .toBe(6);
  await page
    .getByRole("button", { name: "Graph Settings", exact: true })
    .click();
  await expect(page.locator(".axis-bounds").first()).toContainText("a");
  const step = page.getByRole("textbox", { name: /^X axis step/ });
  await step.focus();
  await page.keyboard.type("a/2");
  await page.getByRole("textbox", { name: /^Y axis minimum/ }).focus();
  await expect
    .poll(() =>
      page.evaluate(
        () => window.MathAICalculator.getState().graph.settings.xStep,
      ),
    )
    .toContain("a");
  await page
    .getByRole("button", { name: "Graph Settings", exact: true })
    .click();
  await page.getByRole("button", { name: "Zoom In", exact: true }).click();
  const moved = await page.evaluate(
    () => window.MathAICalculator.getState().graph.viewport.xMax,
  );
  await page.evaluate(() => {
    const s = window.MathAICalculator.getState();
    (s.graph.items[0] as { latex: string }).latex = "a=8";
    window.MathAICalculator.setState(s);
  });
  await page.waitForTimeout(200);
  expect(
    await page.evaluate(
      () => window.MathAICalculator.getState().graph.viewport.xMax,
    ),
  ).toBe(moved);
});

test("multiple regressions reserve distinct residual names and preserve them after removal", async ({
  page,
}) => {
  await inputs(page, [
    "e_1=[9,9,9]",
    "x_1=[1,2,3]",
    "y_1=[1,3,2]",
    "y_1~mx_1+b",
    "y_1~ax_1^2",
  ]);
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.MathAICalculator.getState()
          .graph.items.filter(
            (i) => i.type === "expression" && i.latex.includes("~"),
          )
          .map((i) => i.type === "expression" && i.residualVariable),
      ),
    )
    .toEqual(["e_{2}", "e_{3}"]);
  await page.evaluate(() => {
    const s = window.MathAICalculator.getState();
    s.graph.items = s.graph.items.filter((i) => i.id !== "parity-3");
    s.graph.items.push({
      id: "residual-table",
      type: "table",
      headers: ["x_2", "y_2"],
      values: [
        ["1", "2"],
        ["2", "4"],
        ["3", "3"],
      ],
      color: "#2d70b3",
      hidden: false,
    });
    window.MathAICalculator.setState(s);
  });
  await page
    .getByRole("button", { name: "Add Regression", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.MathAICalculator.getState()
          .graph.items.map((i) =>
            i.type === "expression"
              ? i.residualVariable
              : i.regression?.residualVariable,
          )
          .filter(Boolean),
      ),
    )
    .toEqual(["e_{3}", "e_{2}"]);
  await expect(
    page.locator(".table-regression .residual-controls"),
  ).toContainText("e2");
  await expect(
    page.locator(".custom-regression-result .residual-controls"),
  ).toContainText("e3");
});
