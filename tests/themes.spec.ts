import { test, expect, type Page } from "@playwright/test";

async function ready(page: Page, url = "/") {
  await page.goto(url);
  await page.waitForFunction(
    () => window.MathAICalculator?.getDiagnostics().ready,
  );
}
async function settings(page: Page) {
  await page
    .getByRole("button", { name: "Graph Settings", exact: true })
    .click();
}

test("system appearance is followed until a manual selection, and can be restored", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await ready(page);
  const calculator = page.locator(".calculator");
  await expect(calculator).toHaveAttribute("data-theme", "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(calculator).toHaveAttribute("data-theme", "light");
  await settings(page);
  await expect(page.getByLabel("Use system setting")).toBeChecked();
  await page.getByLabel("Color theme").selectOption("classic");
  await expect(page.getByLabel("Use system setting")).not.toBeChecked();
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(calculator).toHaveAttribute("data-theme", "classic");
  await page.reload();
  await expect(calculator).toHaveAttribute("data-theme", "classic");
  await settings(page);
  await page.getByLabel("Use system setting").check();
  await expect(calculator).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(calculator).toHaveAttribute("data-theme", "dark");
  expect(
    await page.evaluate(() => localStorage.getItem("mathai.theme")),
  ).toBeNull();
});

test("URL theme overrides saved choice only for that page; invalid choices fall back to system", async ({
  page,
}) => {
  await ready(page);
  await page.evaluate(() => localStorage.setItem("mathai.theme", "classic"));
  await ready(page, "/?embed=1&theme=high-contrast");
  await expect(page.locator(".app-header")).toBeHidden();
  await expect(page.locator(".calculator")).toHaveAttribute(
    "data-theme",
    "high-contrast",
  );
  await settings(page);
  await expect(page.getByLabel("Color theme")).toHaveValue("high-contrast");
  await ready(page);
  await expect(page.locator(".calculator")).toHaveAttribute(
    "data-theme",
    "classic",
  );
  await page.evaluate(() => localStorage.setItem("mathai.theme", "invalid"));
  await page.emulateMedia({ colorScheme: "dark" });
  await ready(page, "/?theme=invalid");
  await expect(page.locator(".calculator")).toHaveAttribute(
    "data-theme",
    "dark",
  );
});

test("changing themes preserves results, state, undo history and completed WASM revision", async ({
  page,
}) => {
  await ready(page, "/?theme=classic");
  await page.getByRole("button", { name: "Show Keypad", exact: true }).click();
  await page.keyboard.type("2+3*4");
  await expect(page.getByLabel("Result 14", { exact: true })).toBeVisible();
  const before = await page.evaluate(() => ({
    state: window.MathAICalculator.getState(),
    revision: window.MathAICalculator.getDiagnostics().revision,
  }));
  await settings(page);
  for (const theme of ["light", "dark", "high-contrast", "classic"]) {
    await page.getByLabel("Color theme").selectOption(theme);
    await expect(page.locator(".calculator")).toHaveAttribute(
      "data-theme",
      theme,
    );
    await expect(page.getByLabel("Result 14", { exact: true })).toBeVisible();
    expect(
      await page.evaluate(() => ({
        state: window.MathAICalculator.getState(),
        revision: window.MathAICalculator.getDiagnostics().revision,
      })),
    ).toEqual(before);
  }
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByLabel("Result 14", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.getByLabel("Result 14", { exact: true })).toBeVisible();
  await settings(page);
  await page.getByLabel("Color theme").selectOption("dark");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Switch calculator" }).click();
  await page
    .getByRole("button", { name: "Scientific Calculator", exact: true })
    .click();
  await expect(page.locator(".calculator")).toHaveAttribute(
    "data-theme",
    "dark",
  );
  for (const name of ["9", "Squared", "Enter"])
    await page.getByRole("button", { name, exact: true }).click();
  await expect(page.getByLabel("Result 81", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Color theme").selectOption("high-contrast");
  await expect(page.getByLabel("Result 81", { exact: true })).toBeVisible();
});

test("blocked browser storage still allows system appearance and manual themes", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    for (const method of ["getItem", "setItem", "removeItem"])
      Object.defineProperty(Storage.prototype, method, {
        value() {
          throw new DOMException("Storage blocked", "SecurityError");
        },
      });
  });
  await page.emulateMedia({ colorScheme: "dark" });
  await ready(page);
  await expect(page.locator(".calculator")).toHaveAttribute(
    "data-theme",
    "dark",
  );
  await settings(page);
  await page.getByLabel("Color theme").selectOption("classic");
  await expect(page.locator(".calculator")).toHaveAttribute(
    "data-theme",
    "classic",
  );
  await page.getByLabel("Use system setting").check();
  await expect(page.locator(".calculator")).toHaveAttribute(
    "data-theme",
    "dark",
  );
  expect(errors).toEqual([]);
});

test("dark and high contrast keep black points visible without changing stored plot colors", async ({
  page,
}) => {
  await ready(page, "/?theme=dark");
  await page.evaluate(() => {
    const state = window.MathAICalculator.getState();
    state.graph.settings.grid = false;
    state.graph.settings.xAxis = state.graph.settings.yAxis = false;
    state.graph.items = [
      {
        id: "black-point",
        type: "expression",
        latex: "(3,5)",
        color: "#000000",
        hidden: false,
      },
    ];
    window.MathAICalculator.setState(state);
  });
  await expect(
    page.getByRole("button", { name: "Hide graph 1", exact: true }),
  ).toBeVisible();
  await settings(page);
  for (const theme of ["dark", "high-contrast"]) {
    await page.getByLabel("Color theme").selectOption(theme);
    await expect
      .poll(() =>
        page.locator("canvas").evaluate((canvas: HTMLCanvasElement) => {
          const view = window.MathAICalculator.getState().graph.viewport;
          const scale = canvas.width / canvas.clientWidth;
          const x =
            (((3 - view.xMin) / (view.xMax - view.xMin)) * canvas.clientWidth +
              0.5) *
            scale;
          const y =
            (((view.yMax - 5) / (view.yMax - view.yMin)) * canvas.clientHeight +
              0.5) *
            scale;
          const ctx = canvas.getContext("2d")!;
          const luminance = (rgb: Uint8ClampedArray) =>
            [...rgb]
              .slice(0, 3)
              .map((v) => v / 255)
              .map((v) =>
                v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4,
              )
              .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
          const point = luminance(
            ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data,
          );
          const paper = luminance(ctx.getImageData(2, 2, 1, 1).data);
          return (
            (Math.max(point, paper) + 0.05) / (Math.min(point, paper) + 0.05)
          );
        }),
      )
      .toBeGreaterThanOrEqual(3);
    expect(
      await page.evaluate(
        () => window.MathAICalculator.getState().graph.items[0].color,
      ),
    ).toBe("#000000");
  }
  await page.getByLabel("Reverse contrast", { exact: true }).check();
  await expect(page.locator(".calculator")).toHaveAttribute(
    "data-theme",
    "high-contrast-light",
  );
  await expect(page.getByLabel("Color theme")).toHaveValue("high-contrast");
  await page.getByLabel("Reverse contrast", { exact: true }).uncheck();
  await page.getByLabel("Color theme").selectOption("dark");
  await page.getByLabel("Reverse contrast", { exact: true }).check();
  await expect(page.locator(".calculator")).toHaveAttribute(
    "data-theme",
    "light",
  );
  await expect(page.getByLabel("Color theme")).toHaveValue("dark");
});
