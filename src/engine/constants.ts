import { EngineClient } from "./client";
import type { EngineInput } from "../types";
type Task = {
  latex: string;
  degrees: boolean;
  expressions: EngineInput["expressions"];
  resolve: (value: number) => void;
  reject: (error: Error) => void;
};
const tasks: Task[] = [];
let client: EngineClient | null = null;
function dispatch() {
  const task = tasks[0];
  if (!task) return;
  client ??= new EngineClient(
    (scene) => {
      const current = tasks.shift();
      const row = scene.rows.find((r) => r.id === "constant-result");
      if (row?.value !== null && row?.value !== undefined && !row.error)
        current?.resolve(row.value);
      else current?.reject(new Error(row?.error ?? "Enter a finite number."));
      dispatch();
    },
    (message) => {
      tasks.shift()?.reject(new Error(message));
      dispatch();
    },
  );
  client.calculate({
    expressions: [
      ...task.expressions,
      { id: "constant-result", latex: task.latex },
    ],
    scientific: true,
    degrees: task.degrees,
    complex: false,
    viewport: {
      xMin: -10,
      xMax: 10,
      yMin: -10,
      yMax: 10,
      width: 100,
      height: 100,
    },
  });
}
export function evaluateConstant(
  latex: string,
  expressions: EngineInput["expressions"] = [],
  degrees = false,
): Promise<number> {
  return new Promise((resolve, reject) => {
    tasks.push({ latex, expressions, degrees, resolve, reject });
    if (tasks.length === 1) dispatch();
  });
}
