import temml from "temml";
let modulePromise:
  | Promise<{ mathml_to_braille: (mathml: string, code: string) => string }>
  | undefined;
self.onmessage = async ({
  data,
}: {
  data: { id: number; latex: string; code: "Nemeth" | "UEB"; base: string };
}) => {
  try {
    modulePromise ??= (async () => {
      const url = new URL("wasm/mathai_accessibility.js", data.base).href;
      const mod = await import(/* @vite-ignore */ url);
      await mod.default();
      return mod;
    })();
    const mod = await modulePromise;
    const mathml = temml.renderToString(data.latex, {
      throwOnError: true,
      trust: false,
      maxExpand: 1000,
    });
    const braille = data.latex.trim()
      ? mod.mathml_to_braille(mathml, data.code)
      : "";
    self.postMessage({ id: data.id, braille });
  } catch (error) {
    self.postMessage({ id: data.id, error: String(error) });
  }
};
