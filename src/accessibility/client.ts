let worker: Worker | null = null,
  id = 0;
const pending = new Map<
  number,
  {
    resolve: (v: string) => void;
    reject: (e: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
  }
>();
export function translateBraille(
  latex: string,
  code: "Nemeth" | "UEB",
): Promise<string> {
  if (!latex.trim()) return Promise.resolve("");
  if (!worker) {
    worker = new Worker(new URL("./worker.ts", import.meta.url), {
      type: "module",
    });
    worker.onmessage = ({ data }) => {
      const p = pending.get(data.id);
      if (!p) return;
      clearTimeout(p.timeout);
      pending.delete(data.id);
      if (data.error) p.reject(new Error(data.error));
      else p.resolve(data.braille);
    };
    worker.onerror = () => {
      for (const p of pending.values()) {
        clearTimeout(p.timeout);
        p.reject(new Error("Braille translation could not load."));
      }
      pending.clear();
      worker?.terminate();
      worker = null;
    };
  }
  const job = ++id;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(job);
      reject(new Error("Braille translation timed out."));
    }, 15000);
    pending.set(job, { resolve, reject, timeout });
    worker!.postMessage({
      id: job,
      latex,
      code,
      base: new URL(import.meta.env.BASE_URL, location.href).href,
    });
  });
}
