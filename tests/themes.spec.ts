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
  const originalFlag = await page.evaluate(() => {
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
    const oldSettings = Object.assign(state.graph.settings, {
      reverseContrast: true,
    });
    window.MathAICalculator.setState(state);
    return oldSettings.reverseContrast;
  });
  expect(originalFlag).toBe(true);
  await expect(page.locator(".calculator")).toHaveAttribute(
    "data-theme",
    "dark",
  );
  await expect(
    page.getByRole("button", { name: "Hide graph 1", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        "reverseContrast" in window.MathAICalculator.getState().graph.settings,
    ),
  ).toBe(false);
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
  await expect(
    page.getByRole("checkbox", { name: /reverse contrast/i }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Switch calculator" }).click();
  await page
    .getByRole("button", { name: "Scientific Calculator", exact: true })
    .click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(
    page.getByRole("checkbox", { name: /reverse contrast/i }),
  ).toHaveCount(0);
  await expect(page.getByLabel("Color theme")).toHaveValue("high-contrast");
});

// Compare rendered colors, including inherited backgrounds and inset SVG marks.
async function paintContrast(
  locator: import("@playwright/test").Locator,
  property = "color",
  backgroundProperty?: string,
  pseudo?: string,
) {
  return locator.evaluate(
    (element, { property, backgroundProperty, pseudo }) => {
      const luminance = (color: string) =>
        color
          .match(/[\d.]+/g)!
          .slice(0, 3)
          .map(Number)
          .map((v) => v / 255)
          .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
          .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
      const foreground = getComputedStyle(element, pseudo).getPropertyValue(
        property,
      );
      let background =
        backgroundProperty === "previous-fill"
          ? getComputedStyle(element.previousElementSibling!).fill
          : backgroundProperty
            ? getComputedStyle(element).getPropertyValue(backgroundProperty)
            : "";
      for (
        let parent: Element | null = element;
        !background && parent;
        parent = parent.parentElement
      ) {
        const color = getComputedStyle(parent).backgroundColor;
        if (color !== "rgba(0, 0, 0, 0)" && color !== "transparent")
          background = color;
      }
      const a = luminance(foreground),
        b = luminance(background);
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    },
    { property, backgroundProperty, pseudo },
  );
}
async function setExpressions(page: Page, values: string[]) {
  await page.evaluate((values) => {
    const state = window.MathAICalculator.getState();
    state.graph.items = values.map((latex, i) => ({
      id: `paint-${i}`,
      type: "expression",
      latex,
      color: "#c74440",
      hidden: false,
    }));
    window.MathAICalculator.setState(state);
  }, values);
}
for (const theme of ["dark", "high-contrast"]) {
  test(`${theme} edit controls, keypad and selection marks stay legible`, async ({
    page,
  }) => {
    await ready(page, `/?theme=${theme}`);
    await setExpressions(page, ["2+3", "y=x^2"]);
    await expect(page.getByLabel("Result 5", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Edit Expression List" }).click();
    const down = page.getByRole("button", {
      name: "Move expression 1 down",
      exact: true,
    });
    const remove = page.getByRole("button", {
      name: "Delete All",
      exact: true,
    });
    expect(await paintContrast(down)).toBeGreaterThanOrEqual(4.5);
    expect(await paintContrast(remove)).toBeGreaterThanOrEqual(4.5);
    await down.hover();
    expect(await paintContrast(down)).toBeGreaterThanOrEqual(4.5);
    await down.click();
    await expect
      .poll(() =>
        page.evaluate(
          () => window.MathAICalculator.getState().graph.items[0].id,
        ),
      )
      .toBe("paint-1");
    await page
      .getByRole("button", { name: "Style expression 1", exact: true })
      .click();
    for (const color of ["#c74440", "#fa7e19", "#000000"]) {
      const swatch = page.getByRole("button", {
        name: `Color ${color}`,
        exact: true,
      });
      await swatch.click();
      const mark = swatch.locator("path");
      expect(await paintContrast(mark, "stroke")).toBeGreaterThanOrEqual(4.5);
      await swatch.focus();
      await expect(swatch).not.toHaveCSS("outline-style", "none");
    }
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await page
      .getByRole("button", { name: "Show Keypad", exact: true })
      .click();
    const backspace = page.getByRole("button", {
      name: "Backspace",
      exact: true,
    });
    // The X sits inside the filled icon, so compare against its sibling fill.
    expect(
      await paintContrast(
        backspace.locator("path").nth(1),
        "stroke",
        "previous-fill",
      ),
    ).toBeGreaterThanOrEqual(4.5);
    await page
      .getByRole("button", { name: "Hide Keypad", exact: true })
      .click();
    await settings(page);
    const grid = page.getByRole("checkbox", { name: "Grid", exact: true });
    await expect(grid).toBeChecked();
    expect(
      await paintContrast(
        grid,
        "border-left-color",
        "background-color",
        "::after",
      ),
    ).toBeGreaterThanOrEqual(4.5);
    await grid.uncheck();
    await grid.check();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Edit Expression List" }).click();
    await remove.click();
    expect(
      await paintContrast(page.locator(".clear-dialog p")),
    ).toBeGreaterThanOrEqual(4.5);
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page.getByLabel("Result 5", { exact: true })).toBeVisible();
  });

  test(`${theme} inference forms, result diagrams and observed counts stay legible`, async ({
    page,
  }) => {
    await ready(page, `/?theme=${theme}`);
    await setExpressions(page, ["\\operatorname{ztest}(25,12,3)"]);
    const confidence = page.getByRole("button", {
      name: /Confidence Interval$/,
    });
    await confidence.click();
    await page.getByRole("button", { name: /Hypothesis Test$/ }).click();
    expect(await paintContrast(confidence)).toBeGreaterThanOrEqual(4.5);
    for (const text of await page.locator(".confidence-diagram text").all())
      expect(await paintContrast(text, "fill")).toBeGreaterThanOrEqual(4.5);
    for (const marker of await page
      .locator(".confidence-diagram circle,.hypothesis-diagram circle")
      .all())
      expect(await paintContrast(marker, "fill")).toBeGreaterThanOrEqual(3);
    for (const path of await page
      .locator(".confidence-diagram path,.hypothesis-diagram path[stroke]")
      .all())
      expect(await paintContrast(path, "stroke")).toBeGreaterThanOrEqual(3);
    for (const button of await page.locator(".tails-select button").all())
      expect(await paintContrast(button)).toBeGreaterThanOrEqual(4.5);
    await setExpressions(page, ["\\operatorname{chisqgof}([30,20,25,25])"]);
    await page.getByRole("button", { name: /Observed \(Expected\)$/ }).click();
    expect(
      await paintContrast(page.locator(".observed-table td").first()),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      await paintContrast(page.locator(".observed-table td span").first()),
    ).toBeGreaterThanOrEqual(4.5);
    await setExpressions(page, ["\\operatorname{normaldist}(0,1)"]);
    await page.getByRole("button", { name: /Cumulative Probability$/ }).click();
    const probability = page.getByRole("button", {
      name: "Probability 0.683",
      exact: true,
    });
    await expect(probability).toBeVisible();
    expect(await paintContrast(probability)).toBeGreaterThanOrEqual(4.5);
    expect(
      await paintContrast(probability.locator("span").last()),
    ).toBeGreaterThanOrEqual(4.5);
    for (const choice of await page
      .locator(".visualization-choice button")
      .all())
      expect(await paintContrast(choice)).toBeGreaterThanOrEqual(4.5);
    await probability.click();
    expect(
      await paintContrast(
        page.getByRole("button", { name: "Export probability", exact: true }),
      ),
    ).toBeGreaterThanOrEqual(4.5);
    await setExpressions(page, ["\\operatorname{boxplot}([1,2,3,4,20])"]);
    await expect(page.locator(".visualization-result")).toBeVisible();
    expect(
      await paintContrast(page.locator(".visualization-result .check")),
    ).toBeGreaterThanOrEqual(4.5);
    await page.getByRole("button", { name: "Add Item", exact: true }).click();
    await page.getByRole("button", { name: /inference$/ }).click();
    await expect(page.locator(".inference-wizard")).toHaveCSS(
      "color-scheme",
      "dark",
    );
    expect(
      await paintContrast(page.locator(".inference-or")),
    ).toBeGreaterThanOrEqual(4.5);
    await page.locator(".inference-choices button").nth(1).click();
    await page.getByRole("button", { name: "Stats", exact: true }).click();
    expect(
      await paintContrast(
        page.getByRole("button", { name: "Back", exact: true }),
      ),
    ).toBeGreaterThanOrEqual(4.5);
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
    const create = page.getByRole("button", {
      name: "Create Test",
      exact: true,
    });
    await expect(create).toBeEnabled();
    expect(await paintContrast(create)).toBeGreaterThanOrEqual(4.5);
    await create.click();
    await expect(page.locator(".inference-wizard")).toHaveCount(0);
  });
}
