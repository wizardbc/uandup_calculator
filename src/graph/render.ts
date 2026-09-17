import type {
  GraphSettings,
  Item,
  Scene,
  Viewport,
  Interest,
  PlotStyle,
  RowResult,
} from "../types";
import { COLORS } from "../types";
import { graphPalette, visiblePlotColor, type Theme } from "../theme";
export function graphItem(items: Item[], id: string): Item | undefined {
  const [owner, column] = id.split(/:plot:|:regression/);
  const item = items.find((i) => i.id === owner);
  if (item?.type !== "table") return item;
  if (id.endsWith(":regression"))
    return {
      ...item,
      hidden: item.hidden || Boolean(item.regression?.hidden),
      color: item.regression?.color ?? "#6042a6",
    };
  const col = column ? Number(column) : 1;
  return {
    ...item,
    hidden: item.hidden || Boolean(item.columnHidden?.[col]),
    color:
      item.columnColors?.[col] ??
      (col === 1 ? item.color : COLORS[col % COLORS.length]),
  };
}
export const px = (x: number, v: Viewport) =>
  ((axisValue(x, v.xLog) - axisValue(v.xMin, v.xLog)) * v.width) /
    (axisValue(v.xMax, v.xLog) - axisValue(v.xMin, v.xLog)) +
  0.5;
export const py = (y: number, v: Viewport) =>
  ((axisValue(v.yMax, v.yLog) - axisValue(y, v.yLog)) * v.height) /
    (axisValue(v.yMax, v.yLog) - axisValue(v.yMin, v.yLog)) +
  0.5;
export const worldX = (x: number, v: Viewport) =>
  axisInverse(
    axisValue(v.xMin, v.xLog) +
      ((x - 0.5) / v.width) *
        (axisValue(v.xMax, v.xLog) - axisValue(v.xMin, v.xLog)),
    v.xLog,
  );
export const worldY = (y: number, v: Viewport) =>
  axisInverse(
    axisValue(v.yMax, v.yLog) -
      ((y - 0.5) / v.height) *
        (axisValue(v.yMax, v.yLog) - axisValue(v.yMin, v.yLog)),
    v.yLog,
  );
export const axisValue = (n: number, log = false) => (log ? Math.log10(n) : n);
export const axisInverse = (n: number, log = false) => (log ? 10 ** n : n);
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
export function styleValue(
  row: RowResult,
  key: string,
  index: number,
  fallback: number,
) {
  const values = row.styleValues?.[key];
  return values
    ? values.length === 1
      ? values[0]
      : (values[index] ?? 0)
    : fallback;
}
export function itemPlotStyle(item: Item, id?: string): PlotStyle {
  return item.type === "expression"
    ? (item.plotStyle ?? {})
    : (item.columnStyles?.[Number(id?.split(":plot:")[1] ?? 1)] ?? {});
}
function pointShape(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  style: PlotStyle,
) {
  const r = Math.min(2000, Math.max(0, size / 2));
  if (!r) return;
  const shape = style.pointStyle ?? "point";
  ctx.beginPath();
  if (shape === "point" || shape === "open") ctx.arc(x, y, r, 0, Math.PI * 2);
  else if (shape === "square") ctx.rect(x - r, y - r, r * 2, r * 2);
  else if (shape === "cross" || shape === "plus") {
    if (shape === "cross") {
      ctx.moveTo(x - r * 0.8, y - r * 0.8);
      ctx.lineTo(x + r * 0.8, y + r * 0.8);
      ctx.moveTo(x - r * 0.8, y + r * 0.8);
      ctx.lineTo(x + r * 0.8, y - r * 0.8);
    } else {
      ctx.moveTo(x - r, y);
      ctx.lineTo(x + r, y);
      ctx.moveTo(x, y - r);
      ctx.lineTo(x, y + r);
    }
  } else {
    const n = shape === "triangle" ? 3 : shape === "diamond" ? 4 : 10;
    for (let i = 0; i < n; i++) {
      const rad = r * (shape === "star" && i % 2 ? 0.43 : 1),
        angle = -Math.PI / 2 + (2 * Math.PI * i) / n;
      const a = x + Math.cos(angle) * rad,
        b = y + Math.sin(angle) * rad;
      if (i === 0) ctx.moveTo(a, b);
      else ctx.lineTo(a, b);
    }
    ctx.closePath();
  }
  ctx.lineWidth = Math.max(1.5, r * 0.32);
  if (shape === "open" || shape === "cross" || shape === "plus") ctx.stroke();
  else ctx.fill();
  if (style.pointOutline) {
    ctx.save();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }
}
export function renderGraph(
  ctx: CanvasRenderingContext2D,
  view: Viewport,
  settings: GraphSettings,
  scene: Scene | null,
  items: Item[],
  selected: string | null,
  trace: Interest | null,
  theme: Theme = "classic",
) {
  const { width, height } = view;
  const palette = graphPalette(theme);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = palette.paper;
  ctx.fillRect(0, 0, width, height);
  const x0 = view.xLog ? 0 : px(0, view),
    y0 = view.yLog ? height : py(0, view);
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
    if (vertical ? view.xLog : view.yLog) {
      const logMin = Math.floor(Math.log10(min)),
        logMax = Math.ceil(Math.log10(max));
      if (logMax - logMin > 600) return;
      ctx.beginPath();
      ctx.lineWidth = 1;
      ctx.strokeStyle = major ? palette.major : palette.minor;
      for (let power = logMin; power <= logMax; power++)
        for (let m = major ? 1 : 2; m <= (major ? 1 : 9); m++) {
          const n = m * 10 ** power;
          if (n < min || n > max) continue;
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
      return;
    }
    if (
      !(step > 0) ||
      !Number.isFinite(step) ||
      (max - min) / step > 1000 ||
      !Number.isSafeInteger(Math.ceil(min / step)) ||
      !Number.isSafeInteger(Math.floor(max / step))
    )
      return;
    ctx.beginPath();
    ctx.strokeStyle = major ? palette.major : palette.minor;
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
      ctx.strokeStyle = palette.polar;
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
  ctx.strokeStyle = palette.ink;
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
    ctx.fillStyle = palette.paper;
    ctx.fillRect(
      x - (align === "right" ? m : align === "center" ? m / 2 : 0) - 1,
      y - fontSize / 2,
      m + 2,
      fontSize,
    );
    ctx.fillStyle = palette.ink;
    ctx.fillText(text, x, y);
  };
  if (settings.axisNumbers) {
    for (const axis of ["x", "y"] as const)
      if (view[`${axis}Log`] && settings[`${axis}Axis`]) {
        const lo = Math.ceil(Math.log10(view[`${axis}Min`])),
          hi = Math.floor(Math.log10(view[`${axis}Max`]));
        for (let p = lo; p <= hi && p - lo < 600; p++) {
          const n = 10 ** p;
          if (axis === "x")
            label(
              formatCoordinate(n),
              Math.min(width - 12, Math.max(12, px(n, view))),
              Math.max(12, Math.min(height - 10, y0 + 13)),
              "center",
            );
          else
            label(
              formatCoordinate(n),
              Math.max(24, Math.min(width - 4, x0 - 5)),
              py(n, view),
              "right",
            );
        }
      }
    if (
      settings.xAxis &&
      !view.xLog &&
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
      !view.yLog &&
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
      !view.xLog &&
      !view.yLog &&
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
    for (const row of scene.rows) {
      const item = graphItem(items, row.id);
      if (!item || item.hidden) continue;
      const opacity = item.type === "expression" ? (item.opacity ?? 1) : 1;
      const style = itemPlotStyle(item, row.id);
      const defaultWidth =
        item.type === "expression" ? (item.lineWidth ?? 2.5) : 2.5;
      // Resolve each distinct row color once, including lists of many points.
      const fallbackColor = visiblePlotColor(item.color, theme);
      const plotColors = row.strokeColors?.map((color) =>
        visiblePlotColor(color, theme),
      );
      ctx.strokeStyle = ctx.fillStyle = plotColors?.[0] ?? fallbackColor;
      ctx.lineWidth = defaultWidth;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      let objectIndex = 0;
      for (const geometry of row.geometry) {
        const isPoint = geometry.kind === "points";
        if (geometry.kind === "triangles" && style.fill === false) continue;
        if (!isPoint && geometry.kind !== "triangles" && style.lines === false)
          continue;
        if (
          row.strokeColors &&
          row.strokeColors.length > 1 &&
          objectIndex >= row.strokeColors.length
        )
          continue;
        ctx.strokeStyle = ctx.fillStyle =
          plotColors?.[plotColors.length === 1 ? 0 : objectIndex] ??
          fallbackColor;
        const thickness = Math.min(
          1000,
          Math.max(0, styleValue(row, "lineWidth", objectIndex, defaultWidth)),
        );
        if (
          thickness === 0 &&
          geometry.kind !== "points" &&
          geometry.kind !== "triangles"
        ) {
          objectIndex++;
          continue;
        }
        ctx.lineWidth = thickness || 1;
        const lineOpacity = Math.min(
          1,
          Math.max(0, styleValue(row, "lineOpacity", objectIndex, opacity)),
        );
        ctx.globalAlpha =
          geometry.kind === "triangles"
            ? Math.min(
                1,
                Math.max(0, styleValue(row, "fillOpacity", objectIndex, 0.4)),
              )
            : lineOpacity;
        ctx.setLineDash(
          geometry.dashed ||
            (style.lineStyle ??
              (item.type === "expression" ? item.lineStyle : undefined)) ===
              "dashed"
            ? [8, 6]
            : (style.lineStyle ??
                  (item.type === "expression" ? item.lineStyle : undefined)) ===
                "dotted"
              ? [1, 5]
              : [],
        );
        const data = scene.data;
        const end = geometry.start + geometry.count;
        if (geometry.kind === "points") {
          if (style.lines) {
            ctx.beginPath();
            let pen = false;
            for (let i = geometry.start; i + 1 < end; i += 2) {
              const x = px(data[i], view),
                y = py(data[i + 1], view);
              if (!Number.isFinite(x + y)) {
                pen = false;
                continue;
              }
              if (pen) ctx.lineTo(x, y);
              else ctx.moveTo(x, y);
              pen = true;
            }
            ctx.stroke();
          }
          if (style.points === false) continue;
          for (let i = geometry.start; i + 1 < end; i += 2) {
            const index = (i - geometry.start) / 2;
            if (
              row.strokeColors &&
              row.strokeColors.length > 1 &&
              index >= row.strokeColors.length
            )
              break;
            ctx.strokeStyle = ctx.fillStyle =
              plotColors?.[plotColors.length === 1 ? 0 : index] ??
              fallbackColor;
            ctx.globalAlpha = Math.min(
              1,
              Math.max(0, styleValue(row, "pointOpacity", index, 1)),
            );
            const x = px(data[i], view),
              y = py(data[i + 1], view);
            if (!Number.isFinite(x + y)) continue;
            if ((style.dragMode ?? row.defaultDragMode ?? "none") !== "none") {
              ctx.save();
              ctx.globalAlpha *= 0.3;
              ctx.beginPath();
              ctx.arc(x, y, 12, 0, Math.PI * 2);
              ctx.fill();
              ctx.restore();
            }
            pointShape(
              ctx,
              x,
              y,
              styleValue(
                row,
                "pointSize",
                index,
                row.visualization?.kind === "dotplot" ? 14 : 8,
              ),
              style,
            );
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
        objectIndex++;
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
    ctx.fillStyle = palette.trace;
    ctx.strokeStyle = palette.traceOutline;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(px(trace.x, view), py(trace.y, view), 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.setLineDash([]);
}
