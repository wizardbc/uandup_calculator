/// <reference lib="webworker" />
import type { EngineInput } from "../types";

type WasmEngine = {
  calculate(input: string): string;
  take_geometry(): Float64Array;
  free(): void;
};
let instance: WasmEngine;
let boot: Promise<void> | undefined;
function initialize(base: string) {
  if (!boot)
    boot = (async () => {
      const url = new URL("wasm/uandup_engine.js", base).href;
      const wasm = await import(/* @vite-ignore */ url);
      await wasm.default({
        module_or_path: new URL("wasm/uandup_engine_bg.wasm", base).href,
      });
      instance = new wasm.CalculatorEngine();
    })();
  return boot;
}
self.onmessage = async (
  event: MessageEvent<{ id: number; base: string; input: EngineInput }>,
) => {
  const { id, input, base } = event.data;
  try {
    await initialize(base);
    const start = performance.now();
    const result = JSON.parse(instance.calculate(JSON.stringify(input)));
    if (result.error) throw new Error(result.error);
    const data = instance.take_geometry();
    self.postMessage(
      {
        id,
        scene: {
          ...result,
          data,
          viewport: input.viewport,
          duration: performance.now() - start,
        },
      },
      [data.buffer],
    );
  } catch (error) {
    self.postMessage({
      id,
      error:
        error instanceof Error
          ? error.message
          : "Unable to calculate this expression.",
    });
  }
};
