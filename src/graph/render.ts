import type { GraphSettings, Item, Scene, Viewport, Interest } from "../types";
export const px = (x: number, v: Viewport) =>
  ((x - v.xMin) * v.width) / (v.xMax - v.xMin) + 0.5;
export const py = (y: number, v: Viewport) =>
  ((v.yMax - y) * v.height) / (v.yMax - v.yMin) + 0.5;
export const worldX = (x: number, v: Viewport) =>
  v.xMin + ((x - 0.5) / v.width) * (v.xMax - v.xMin);
export const worldY = (y: number, v: Viewport) =>
  v.yMax - ((y - 0.5) / v.height) * (v.yMax - v.yMin);
export function niceStep(span: number, size: number) {
  const target = (span * 80) / size;
  const power = 10 ** Math.floor(Math.log10(target));
  return (
    [1, 2, 5, 10].map((n) => n * power).find((n) => n >= target) ?? power * 10
  );
}
export function formatCoordinate(n: number, digits = 6) {
  if (Math.abs(n) < 1e-10) return "0";
  if (Math.abs(n) >= 1e8 || Math.abs(n) < 1e-5)
    return Number(n.toPrecision(digits)).toString();
  return Number(n.toFixed(digits)).toString();
}
export function renderGraph(
  ctx: CanvasRenderingContext2D,
  view: Viewport,
  settings: GraphSettings,
  scene: Scene | null,
  items: Item[],
  selected: string | null,
  trace: Interest | null,
) {
  const { width, height } = view;
  const dark = settings.reverseContrast;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = dark ? "#161616" : "#fff";
  ctx.fillRect(0, 0, width, height);
  const x0 = px(0, view),
    y0 = py(0, view);
  const sx =
    Number(settings.xStep) > 0
      ? Number(settings.xStep)
      : niceStep(view.xMax - view.xMin, width);
  const sy =
    Number(settings.yStep) > 0
      ? Number(settings.yStep)
      : niceStep(view.yMax - view.yMin, height);
  function lines(
    step: number,
    min: number,
    max: number,
    vertical: boolean,
    major: boolean,
  ) {
    if (
      !(step > 0) ||
      !Number.isFinite(step) ||
      (max - min) / step > 1000 ||
      !Number.isSafeInteger(Math.ceil(min / step)) ||
      !Number.isSafeInteger(Math.floor(max / step))
    )
      return;
    ctx.beginPath();
    ctx.strokeStyle = dark
      ? major
        ? "#777"
        : "#3b3b3b"
      : major
        ? "#999"
        : "#e0e0e0";
    ctx.lineWidth = 1;
    for (let i = Math.ceil(min / step); i <= Math.floor(max / step); i++) {
      const n = i * step;
      const p = Math.round(vertical ? px(n, view) : py(n, view)) + 0.5;
      if (vertical) {
        ctx.moveTo(p, 0);
        ctx.lineTo(p, height);
      } else {
        ctx.moveTo(0, p);
        ctx.lineTo(width, p);
      }
    }
    ctx.stroke();
  }
  if (settings.grid) {
    if (settings.polar) {
      ctx.strokeStyle = dark ? "#666" : "#bbb";
      ctx.lineWidth = 1;
      const maxRadius = Math.max(
        Math.hypot(view.xMin, view.yMin),
        Math.hypot(view.xMax, view.yMax),
      );
      for (let r = sx; r <= maxRadius && r / sx < 200; r += sx) {
        ctx.beginPath();
        ctx.ellipse(
          x0,
          y0,
          (r * width) / (view.xMax - view.xMin),
          (r * height) / (view.yMax - view.yMin),
          0,
          0,
          2 * Math.PI,
        );
        ctx.stroke();
      }
      for (let t = 0; t < Math.PI; t += Math.PI / 12) {
        ctx.beginPath();
        ctx.moveTo(
          px(-maxRadius * Math.cos(t), view),
          py(-maxRadius * Math.sin(t), view),
        );
        ctx.lineTo(
          px(maxRadius * Math.cos(t), view),
          py(maxRadius * Math.sin(t), view),
        );
        ctx.stroke();
      }
    } else {
      if (settings.minorGrid) {
        lines(sx / 4, view.xMin, view.xMax, true, false);
        lines(sy / 4, view.yMin, view.yMax, false, false);
      }
      lines(sx, view.xMin, view.xMax, true, true);
      lines(sy, view.yMin, view.yMax, false, true);
    }
  }
  ctx.strokeStyle = dark ? "#eee" : "#000";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  if (settings.xAxis) {
    ctx.moveTo(0, y0);
    ctx.lineTo(width, y0);
  }
  if (settings.yAxis) {
    ctx.moveTo(x0, 0);
    ctx.lineTo(x0, height);
  }
  ctx.stroke();
  if (settings.arrows) {
    ctx.beginPath();
    if (settings.xAxis) {
      ctx.moveTo(width - 8, y0 - 4);
      ctx.lineTo(width - 2, y0);
      ctx.lineTo(width - 8, y0 + 4);
    }
    if (settings.yAxis) {
      ctx.moveTo(x0 - 4, 8);
      ctx.lineTo(x0, 2);
      ctx.lineTo(x0 + 4, 8);
    }
    ctx.stroke();
  }
  const fontSize = settings.largeText ? 18 : 14;
  ctx.font = `${fontSize}px Arial, sans-serif`;
  ctx.textBaseline = "middle";
  const label = (
    text: string,
    x: number,
    y: number,
    align: CanvasTextAlign,
  ) => {
    ctx.textAlign = align;
    const m = ctx.measureText(text).width;
    ctx.fillStyle = dark ? "#161616" : "#fff";
    ctx.fillRect(
      x - (align === "right" ? m : align === "center" ? m / 2 : 0) - 1,
      y - fontSize / 2,
      m + 2,
      fontSize,
    );
    ctx.fillStyle = dark ? "#eee" : "#000";
    ctx.fillText(text, x, y);
  };
  if (settings.axisNumbers) {
    if (
      settings.xAxis &&
      (view.xMax - view.xMin) / sx < 300 &&
      Number.isSafeInteger(Math.ceil(view.xMin / sx)) &&
      Number.isSafeInteger(Math.floor(view.xMax / sx))
    )
      for (
        let i = Math.ceil(view.xMin / sx);
        i <= Math.floor(view.xMax / sx);
        i++
      ) {
        if (i === 0) continue;
        const x = px(i * sx, view);
        const text = formatCoordinate(i * sx);
        label(
          text,
          Math.min(
            width - ctx.measureText(text).width / 2 - 2,
            Math.max(ctx.measureText(text).width / 2 + 2, x),
          ),
          Math.max(12, Math.min(height - 10, y0 + 13)),
          "center",
        );
      }
    if (
      settings.yAxis &&
      (view.yMax - view.yMin) / sy < 300 &&
      Number.isSafeInteger(Math.ceil(view.yMin / sy)) &&
      Number.isSafeInteger(Math.floor(view.yMax / sy))
    )
      for (
        let i = Math.ceil(view.yMin / sy);
        i <= Math.floor(view.yMax / sy);
        i++
      ) {
        if (i === 0) continue;
        const y = py(i * sy, view);
        if (y < 8 || y > height - 8) continue;
        label(
          formatCoordinate(i * sy),
          Math.max(24, Math.min(width - 4, x0 - 5)),
          y,
          "right",
        );
      }
    if (
      settings.xAxis &&
      settings.yAxis &&
      x0 >= 0 &&
      x0 <= width &&
      y0 >= 0 &&
      y0 < height - 18
    )
      label("0", x0 - 5, y0 + 13, "right");
  }
  if (settings.xLabel)
    label(
      settings.xLabel,
      width - 12,
      Math.max(14, Math.min(height - 14, y0 - 14)),
      "right",
    );
  if (settings.yLabel)
    label(
      settings.yLabel,
      Math.max(14, Math.min(width - 14, x0 + 10)),
      14,
      "left",
    );
  if (scene) {
    const itemMap = new Map(items.map((i) => [i.id, i]));
    for (const row of scene.rows) {
      const item = itemMap.get(row.id);
      if (!item || item.hidden) continue;
      const opacity = item.type === "expression" ? (item.opacity ?? 1) : 1;
      ctx.strokeStyle = item.color;
      ctx.fillStyle = item.color;
      ctx.lineWidth = item.type === "expression" ? (item.lineWidth ?? 3) : 3;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      for (const geometry of row.geometry) {
        ctx.globalAlpha =
          geometry.kind === "triangles" ? 0.22 * opacity : opacity;
        ctx.setLineDash(
          geometry.dashed ||
            (item.type === "expression" && item.lineStyle === "dashed")
            ? [8, 6]
            : item.type === "expression" && item.lineStyle === "dotted"
              ? [1, 5]
              : [],
        );
        const data = scene.data;
        const end = geometry.start + geometry.count;
        if (geometry.kind === "points") {
          for (let i = geometry.start; i + 1 < end; i += 2) {
            const x = px(data[i], view),
              y = py(data[i + 1], view);
            if (!Number.isFinite(x + y)) continue;
            ctx.beginPath();
            ctx.arc(x, y, 4.5, 0, Math.PI * 2);
            ctx.fill();
          }
        } else if (geometry.kind === "triangles") {
          ctx.beginPath();
          for (let i = geometry.start; i + 5 < end; i += 6) {
            ctx.moveTo(px(data[i], view), py(data[i + 1], view));
            ctx.lineTo(px(data[i + 2], view), py(data[i + 3], view));
            ctx.lineTo(px(data[i + 4], view), py(data[i + 5], view));
            ctx.closePath();
          }
          ctx.fill();
        } else {
          ctx.beginPath();
          let pen = false;
          for (let i = geometry.start; i + 1 < end; i += 2) {
            const x = px(data[i], view),
              y = py(data[i + 1], view);
            if (
              !Number.isFinite(x + y) ||
              Math.abs(x) > 1e7 ||
              Math.abs(y) > 1e7
            ) {
              pen = false;
              continue;
            }
            if (
              !pen ||
              (geometry.kind === "segments" && (i - geometry.start) % 4 === 0)
            )
              ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
            pen = true;
          }
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
      ctx.setLineDash([]);
      if (row.id === selected) {
        ctx.fillStyle = "#aaa";
        for (const point of row.points) {
          ctx.beginPath();
          ctx.arc(px(point.x, view), py(point.y, view), 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }
  if (trace) {
    ctx.fillStyle = "#000";
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(px(trace.x, view), py(trace.y, view), 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.setLineDash([]);
}
