import type { EngineInput, Scene } from "../types";

export class EngineClient {
  private worker: Worker | null = null;
  private nextId = 0;
  private activeId: number | null = null;
  private pending: { id: number; input: EngineInput } | null = null;
  private timeout: ReturnType<typeof setTimeout> | undefined;
  private latestId = 0;
  private activeInput: EngineInput | null = null;
  constructor(
    private result: (scene: Scene, input: EngineInput) => void,
    private error: (message: string) => void,
  ) {}
  private start() {
    this.worker = new Worker(new URL("./worker.ts", import.meta.url), {
      type: "module",
    });
    this.worker.onmessage = ({
      data,
    }: MessageEvent<{ id: number; scene?: Scene; error?: string }>) => {
      clearTimeout(this.timeout);
      this.activeId = null;
      if (data.id === this.latestId) {
        if (data.scene && this.activeInput)
          this.result({ ...data.scene, revision: data.id }, this.activeInput);
        else this.error(data.error ?? "Calculation failed.");
      }
      this.dispatch();
    };
    this.worker.onerror = () => {
      this.stop();
      this.error(
        "The calculation engine could not load. Reload the calculator to try again.",
      );
    };
  }
  calculate(input: EngineInput) {
    this.latestId = ++this.nextId;
    this.pending = { id: this.latestId, input };
    this.dispatch();
  }
  private dispatch() {
    if (this.activeId !== null || !this.pending) return;
    if (!this.worker) this.start();
    const task = this.pending;
    this.pending = null;
    this.activeId = task.id;
    this.activeInput = task.input;
    this.worker!.postMessage({
      ...task,
      base: new URL(import.meta.env.BASE_URL, location.href).href,
    });
    this.timeout = setTimeout(() => {
      this.worker?.terminate();
      this.worker = null;
      this.activeId = null;
      if (this.pending) this.dispatch();
      else
        this.error(
          "This calculation took too long. Simplify the expression and try again.",
        );
    }, 5000);
  }
  stop() {
    clearTimeout(this.timeout);
    this.worker?.terminate();
    this.worker = null;
    this.activeId = null;
    this.pending = null;
  }
}
