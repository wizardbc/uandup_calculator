import { test, expect } from "@playwright/test";

test("iframe protocol restores state, rejects invalid messages, and resets", async ({
  page,
  baseURL,
}) => {
  const origin = new URL(baseURL!).origin;
  await page.route("**/test-host", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><script>window.replies=[];addEventListener('message',e=>{if(e.data.channel==='uandup-calculator')window.replies.push(e.data)})</script><iframe title="Calculator" width="1000" height="700" src="${origin}/?embed=1&hostOrigin=${encodeURIComponent(origin)}"></iframe>`,
    }),
  );
  await page.goto("/test-host");
  const frame = page.frames().find((f) => f.parentFrame())!;
  await frame.waitForFunction(
    () => window.UandupCalculator?.getDiagnostics().ready,
  );
  const send = async (requestId: string, type: string, extra: object = {}) => {
    await page.evaluate(
      ({ requestId, type, extra, origin }) =>
        document.querySelector("iframe")!.contentWindow!.postMessage(
          {
            channel: "uandup-calculator",
            version: 1,
            requestId,
            type,
            ...extra,
          },
          origin,
        ),
      { requestId, type, extra, origin },
    );
    await page.waitForFunction(
      (id) =>
        (
          window as unknown as { replies: { requestId: string }[] }
        ).replies.some((r) => r.requestId === id),
      requestId,
    );
    return page.evaluate(
      (id) =>
        (
          window as unknown as { replies: Record<string, unknown>[] }
        ).replies.find((r) => r.requestId === id)!,
      requestId,
    );
  };
  const received = await send("read", "getState");
  expect(received.type).toBe("state");
  const state = received.state as ReturnType<
    Window["UandupCalculator"]["getState"]
  >;
  state.graph.items[0] = {
    ...state.graph.items[0],
    type: "expression",
    latex: "7*8",
  };
  expect((await send("write", "setState", { state })).type).toBe("ack");
  await expect(frame.getByLabel("Result 56", { exact: true })).toBeVisible();
  state.graph.viewport.xMax = state.graph.viewport.xMin;
  expect((await send("invalid", "setState", { state })).type).toBe("error");
  await expect(frame.getByLabel("Result 56", { exact: true })).toBeVisible();
  // A sibling frame has the allowed origin but is not the parent. Its reset is ignored.
  await page.evaluate(() => {
    const sibling = document.createElement("iframe");
    sibling.src = "about:blank";
    document.body.append(sibling);
  });
  const sibling = page.frames().find((f) => f !== frame && f.parentFrame())!;
  await sibling.evaluate(
    (origin) =>
      parent.frames[0].postMessage(
        {
          channel: "uandup-calculator",
          version: 1,
          requestId: "sibling",
          type: "reset",
        },
        origin,
      ),
    origin,
  );
  await page.waitForTimeout(200);
  await expect(frame.getByLabel("Result 56", { exact: true })).toBeVisible();
  expect((await send("reset", "reset")).type).toBe("ack");
  await expect(frame.getByLabel("Result 56", { exact: true })).toHaveCount(0);
  await expect(frame.locator(".app-header")).toBeHidden();
});
