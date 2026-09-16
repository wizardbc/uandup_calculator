import { test, expect } from "@playwright/test";
test("small screen graphing and scientific keypads remain usable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.waitForFunction(
    () => window.UandupCalculator?.getDiagnostics().ready,
  );
  await page.getByRole("button", { name: "Show Keypad", exact: true }).click();
  await page.getByRole("button", { name: "7", exact: true }).click();
  await page.getByRole("button", { name: "Plus" }).click();
  await page.getByRole("button", { name: "8", exact: true }).click();
  await expect(page.getByLabel("Result 15", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  await page.getByRole("button", { name: "Switch calculator" }).click();
  await page.getByRole("button", { name: "Scientific Calculator" }).click();
  const rect = await page.locator(".scientific-calculator").boundingBox();
  expect(rect!.width).toBeLessThanOrEqual(390);
  expect(rect!.x).toBeGreaterThanOrEqual(0);
  await page.getByRole("button", { name: "9", exact: true }).click();
  await page.getByRole("button", { name: "Squared", exact: true }).click();
  await page.getByRole("button", { name: "Enter", exact: true }).click();
  await expect(page.getByLabel("Result 81", { exact: true })).toBeVisible();
});

test("appearance controls remain reachable on short graphing and scientific screens", async ({
  page,
}) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto("/?theme=classic");
  await page.waitForFunction(
    () => window.MathAICalculator?.getDiagnostics().ready,
  );
  for (const mode of ["graphing", "scientific"]) {
    if (mode === "scientific") {
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "Switch calculator" }).click();
      await page
        .getByRole("button", { name: "Scientific Calculator", exact: true })
        .click();
    }
    await page
      .getByRole("button", {
        name: mode === "graphing" ? "Graph Settings" : "Settings",
        exact: true,
      })
      .click();
    await page.getByLabel("Color theme").scrollIntoViewIfNeeded();
    await page
      .getByLabel("Color theme")
      .selectOption(mode === "graphing" ? "dark" : "high-contrast");
    await page.getByLabel("Use system setting").check();
    const box = await page.locator(".settings-panel").boundingBox();
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(390);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(844);
  }
});
