import { test, expect } from "@playwright/test";

test("rapid edits replace pending work and never display an obsolete result", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const probe = {
      hold: false,
      recording: false,
      sent: [] as string[],
      held: [] as { worker: Worker; data: unknown }[],
      displayed: [] as string[],
    };
    (window as any).calculationQueueProbe = probe;
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.addEventListener("message", (event) => {
          if (probe.hold && event.data?.scene) {
            event.stopImmediatePropagation();
            probe.held.push({ worker: this, data: event.data });
          }
        });
      }
      postMessage(message: any, options?: any) {
        if (probe.recording && message?.input)
          probe.sent.push(message.input.expressions[0].latex);
        super.postMessage(message, options);
      }
    };
    new MutationObserver(() => {
      if (!probe.recording) return;
      const value = document
        .querySelector('[aria-label^="Result "]')
        ?.getAttribute("aria-label");
      if (value) probe.displayed.push(value);
    }).observe(document, { subtree: true, childList: true, attributes: true });
  });
  await page.goto("/");
  await page.waitForFunction(
    () => window.MathAICalculator?.getDiagnostics().ready,
  );
  await page.evaluate(async () => {
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    const probe = (window as any).calculationQueueProbe;
    probe.recording = probe.hold = true;
    const state = window.MathAICalculator.getState();
    state.graph.items = [
      {
        id: "queue",
        type: "expression",
        latex: "1000+1",
        color: "#c74440",
        hidden: false,
      },
    ];
    window.MathAICalculator.setState(state);
  });
  await page.waitForFunction(
    () => (window as any).calculationQueueProbe.held.length === 1,
  );
  await page.evaluate(async () => {
    for (let i = 2; i <= 12; i++) {
      const state = window.MathAICalculator.getState();
      (state.graph.items[0] as { latex: string }).latex = `1000+${i}`;
      window.MathAICalculator.setState(state);
      await new Promise(requestAnimationFrame);
    }
  });
  expect(
    await page.evaluate(() => (window as any).calculationQueueProbe.sent),
  ).toEqual(["1000+1"]);
  await page.evaluate(() => {
    const probe = (window as any).calculationQueueProbe;
    probe.hold = false;
    for (const { worker, data } of probe.held.splice(0))
      worker.dispatchEvent(new MessageEvent("message", { data }));
  });
  await expect(page.getByLabel("Result 1012", { exact: true })).toBeVisible();
  const probe = await page.evaluate(() => {
    const p = (window as any).calculationQueueProbe;
    return { sent: p.sent, displayed: p.displayed };
  });
  expect(probe.sent).toEqual(["1000+1", "1000+12"]);
  expect(probe.displayed.length).toBeGreaterThan(0);
  expect(
    probe.displayed.every((value: string) => value === "Result 1012"),
  ).toBe(true);
});
