import { test, expect, type Page } from "@playwright/test";

async function ready(page: Page) {
  await page.goto("/");
  await page.waitForFunction(
    () => window.UandupCalculator?.getDiagnostics().ready,
  );
}
async function expressions(page: Page, inputs: string[]) {
  await page.evaluate((inputs) => {
    const state = window.UandupCalculator.getState();
    state.graph.items = inputs.map((latex, i) => ({
      id: `test-${i}`,
      type: "expression",
      latex,
      color: ["#c74440", "#2d70b3", "#388c46"][i % 3],
      hidden: false,
    }));
    window.UandupCalculator.setState(state);
  }, inputs);
  await page.waitForFunction(
    () => window.UandupCalculator.getDiagnostics().ready,
  );
}
test.beforeEach(async ({ page }) => {
  await ready(page);
});

test("loads real WASM and matches the measured desktop layout", async ({
  page,
}) => {
  expect(
    await page.evaluate(() => window.UandupCalculator.getDiagnostics().engine),
  ).toBe("rust-wasm");
  const panel = await page.locator(".expression-panel").boundingBox();
  const toolbar = await page.locator(".expression-toolbar").boundingBox();
  expect(panel!.width).toBe(417);
  expect(panel!.y).toBe(50);
  expect(toolbar!.height).toBe(49);
  await expect(page.locator("body")).not.toContainText(/desmos|college board/i);
  await expect(page.getByRole("alert")).toHaveCount(0);
});
test("keyboard expression, enter, numeric result and undo", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Show Keypad", exact: true }).click();
  await page.keyboard.type("y=x^2");
  await expect
    .poll(() =>
      page.evaluate(() => window.UandupCalculator.getState().graph.items[0]),
    )
    .toMatchObject({ latex: "y=x^{2}" });
  await page.keyboard.press("Enter");
  await page.keyboard.type("2+3*4");
  await expect(page.getByLabel("Result 14", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByLabel("Result 14", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.getByLabel("Result 14", { exact: true })).toBeVisible();
});
test("on-screen fraction, square root and scientific Enter", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Switch calculator" }).click();
  await page.getByRole("button", { name: "Scientific Calculator" }).click();
  const box = await page.locator(".scientific-calculator").boundingBox();
  expect(box).toMatchObject({ x: 370, y: 205, width: 540, height: 440 });
  await page.getByRole("button", { name: "Square Root", exact: true }).click();
  await page.getByRole("button", { name: "8", exact: true }).click();
  await page.getByRole("button", { name: "1", exact: true }).click();
  await page.getByRole("button", { name: "Enter", exact: true }).click();
  await expect(page.getByLabel("Result 9", { exact: true })).toBeVisible();
  await expect(page.locator(".scientific-expression")).toHaveCount(2);
  await page.getByRole("button", { name: "A over B" }).click();
  await page.getByRole("button", { name: "1", exact: true }).click();
  await page.getByRole("button", { name: "Right Arrow" }).click();
  await page.getByRole("button", { name: "2", exact: true }).click();
  await expect(page.getByLabel("Result 0.5", { exact: true })).toBeVisible();
});
test("mode switch preserves independent expressions and angle settings", async ({
  page,
}) => {
  await expressions(page, ["y=x^2"]);
  await page.getByRole("button", { name: "Switch calculator" }).click();
  await page.getByRole("button", { name: "Scientific Calculator" }).click();
  await page.locator(".scientific-expression textarea").first().focus();
  await page.keyboard.type("sin(30)");
  await page.getByRole("button", { name: "DEG", exact: true }).click();
  await expect(page.getByLabel("Result 0.5", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Switch calculator" }).click();
  await page.getByRole("button", { name: "Graphing Calculator" }).click();
  expect(
    await page.evaluate(
      () => window.UandupCalculator.getState().graph.items[0],
    ),
  ).toMatchObject({ latex: "y=x^2" });
  expect(
    await page.evaluate(
      () => window.UandupCalculator.getState().graph.settings.degrees,
    ),
  ).toBe(false);
  await page.getByRole("button", { name: "Switch calculator" }).click();
  await page.getByRole("button", { name: "Scientific Calculator" }).click();
  await expect(page.getByLabel("Result 0.5", { exact: true })).toBeVisible();
});
test("sliders update dependent graphs and hidden graphs can be restored", async ({
  page,
}) => {
  await expressions(page, ["a=1", "y=a*x^2"]);
  await expect(
    page.getByRole("slider", { name: "Slider a", exact: true }),
  ).toBeVisible();
  await page.getByRole("slider", { name: "Slider a", exact: true }).fill("3");
  await expect
    .poll(() =>
      page.evaluate(() => window.UandupCalculator.getState().graph.items[0]),
    )
    .toMatchObject({ latex: "a=3" });
  await page.getByRole("button", { name: "Hide graph 2", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Show graph 2", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Show graph 2", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Hide graph 2", exact: true }),
  ).toBeVisible();
});
test("table paste and a linear regression recover known parameters", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Add Item", exact: true }).click();
  await page.getByRole("button", { name: "table", exact: true }).click();
  await expect(page.locator(".expression-row").first()).toHaveClass(
    /table-row/,
  );
  await expect(
    page.getByRole("button", { name: "Add Regression", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Zoom Fit", exact: true }),
  ).toHaveCount(0);
  const cell = page.getByRole("textbox", { name: /^Table row 1 column 1:/ });
  await cell.focus();
  await cell.evaluate((el) => {
    const data = new DataTransfer();
    data.setData("text/plain", "1\t3\n2\t5\n3\t7\n4\t9");
    const event = new ClipboardEvent("paste", {
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(event, "clipboardData", { value: data });
    el.dispatchEvent(event);
  });
  await expect(
    page.getByRole("textbox", { name: /^Table row 4 column 2:/ }),
  ).toHaveCount(1);
  await page.evaluate(() => {
    const s = window.UandupCalculator.getState();
    s.graph.items.push({
      id: "regression",
      type: "expression",
      latex: "y_1~m x_1+b",
      color: "#2d70b3",
      hidden: false,
    });
    window.UandupCalculator.setState(s);
  });
  await expect(page.locator(".custom-regression-result")).toBeVisible();
  await expect(page.locator(".custom-regression-result")).toContainText("m=2");
  await expect(page.locator(".custom-regression-result")).toContainText("b=1");
});
test("table cell retains virtual keypad focus", async ({ page }) => {
  await page.getByRole("button", { name: "Add Item", exact: true }).click();
  await page.getByRole("button", { name: "table", exact: true }).click();
  await page.getByRole("textbox", { name: /^Table row 1 column 1:/ }).focus();
  await page.getByRole("button", { name: "7", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.UandupCalculator.getState().graph.items.find(
            (i) => i.type === "table",
          )?.values[0][0],
      ),
    )
    .toBe("7");
});
test("coordinates identify an intersection and graph controls change the viewport", async ({
  page,
}) => {
  await expressions(page, ["y=x^2", "y=4"]);
  await page.locator("canvas").click({ position: { x: 518.4, y: 202.2 } });
  await expect(page.locator(".coordinate-label")).toContainText("(2,4)");
  await page.getByRole("button", { name: "Zoom In" }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () => window.UandupCalculator.getState().graph.viewport.xMax,
      ),
    )
    .toBeCloseTo(8);
  await page.getByRole("button", { name: "Default View" }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () => window.UandupCalculator.getState().graph.viewport.xMax,
      ),
    )
    .toBeCloseTo(10);
});
test("settings, errors, and clearing can be operated without reloading", async ({
  page,
}) => {
  await expressions(page, ["a=b", "b=a"]);
  await expect(page.locator(".expression-error").first()).toContainText(
    "Circular",
  );
  await page
    .getByRole("button", { name: "Graph Settings", exact: true })
    .click();
  await page.getByLabel("Grid", { exact: true }).uncheck();
  expect(
    await page.evaluate(
      () => window.UandupCalculator.getState().graph.settings.grid,
    ),
  ).toBe(false);
  const minimum = page.getByRole("textbox", { name: /^X axis minimum:/ });
  await minimum.focus();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("10");
  await minimum.press("Enter");
  await expect(page.getByRole("alert")).toContainText("minimum");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Edit Expression List" }).click();
  await page.getByRole("button", { name: "Delete All" }).click();
  await page.getByRole("button", { name: "Clear all", exact: true }).click();
  await expect(page.locator(".expression-row")).toHaveCount(1);
  await expect(page.locator(".expression-error")).toHaveCount(0);
});
test("state validation rejects malformed bounds and duplicate IDs", async ({
  page,
}) => {
  const result = await page.evaluate(() => {
    const s = window.UandupCalculator.getState();
    s.graph.viewport.xMax = s.graph.viewport.xMin;
    try {
      window.UandupCalculator.setState(s);
      return false;
    } catch {
      return true;
    }
  });
  expect(result).toBe(true);
  const state = await page.evaluate(() => window.UandupCalculator.getState());
  expect(state.graph.viewport.xMin).toBe(-10);
  expect(
    await page.evaluate(() => {
      const s = window.UandupCalculator.getState();
      s.graph.items.push({ ...s.graph.items[0] });
      try {
        window.UandupCalculator.setState(s);
        return false;
      } catch {
        return true;
      }
    }),
  ).toBe(true);
});

test("finite sums and integrals evaluate without introducing sliders", async ({
  page,
}) => {
  await expressions(page, [
    String.raw`\sum_{n=1}^{10}n`,
    String.raw`\int_0^3 x^2dx`,
  ]);
  await expect(page.getByLabel("Result 55", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Result 9", { exact: true })).toBeVisible();
  await expect(page.locator(".missing-variables")).toHaveCount(0);
});

test("exponential regression log mode can be switched", async ({ page }) => {
  await expressions(page, [
    "x_1=[1,2,3,4]",
    "y_1=[4,8,16,32]",
    "y_1~a b^{x_1}",
  ]);
  const toggle = page.getByLabel("Log Mode", { exact: true });
  await expect(toggle).toBeChecked();
  await expect(page.locator(".custom-regression-result")).toContainText("a=2");
  await toggle.uncheck();
  await expect(toggle).not.toBeChecked();
  await expect(page.locator(".custom-regression-result")).toContainText("b=2");
});
