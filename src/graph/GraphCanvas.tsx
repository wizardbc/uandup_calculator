import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { GraphSettings, Item, Scene, Viewport, Interest } from "../types";
import {
  renderGraph,
  px,
  py,
  worldX,
  worldY,
  formatCoordinate,
  axisValue,
  axisInverse,
  graphItem,
  itemPlotStyle,
  styleValue,
} from "./render";
import { dragPoint } from "./pointDrag";
import { MathText } from "../components/MathField";

export function zoomViewport(
  view: Viewport,
  factor: number,
  atX = view.width / 2 + 0.5,
  atY = view.height / 2 + 0.5,
): Viewport {
  const x = axisValue(worldX(atX, view), view.xLog),
    y = axisValue(worldY(atY, view), view.yLog);
  const span =
    (axisValue(view.xMax, view.xLog) - axisValue(view.xMin, view.xLog)) *
    factor;
  if (span < 1e-10 || span > 1e14) return view;
  return {
    ...view,
    xMin: axisInverse(
      x + (axisValue(view.xMin, view.xLog) - x) * factor,
      view.xLog,
    ),
    xMax: axisInverse(
      x + (axisValue(view.xMax, view.xLog) - x) * factor,
      view.xLog,
    ),
    yMin: axisInverse(
      y + (axisValue(view.yMin, view.yLog) - y) * factor,
      view.yLog,
    ),
    yMax: axisInverse(
      y + (axisValue(view.yMax, view.yLog) - y) * factor,
      view.yLog,
    ),
  };
}
export function panViewport(v: Viewport, dx: number, dy: number): Viewport {
  return {
    ...v,
    xMin: worldX(0.5 + dx, v),
    xMax: worldX(v.width + 0.5 + dx, v),
    yMin: worldY(v.height + 0.5 + dy, v),
    yMax: worldY(0.5 + dy, v),
  };
}
export function GraphCanvas({
  viewport,
  settings,
  scene,
  items,
  active,
  onViewport,
  onSelect,
  onInteract,
  onItems,
  audioPoint,
}: {
  viewport: Viewport;
  settings: GraphSettings;
  scene: Scene | null;
  items: Item[];
  active: string | null;
  onViewport: (viewport: Viewport) => void;
  onSelect: (id: string) => void;
  onInteract: () => void;
  onItems: (items: Item[]) => void;
  audioPoint?: Interest | null;
}) {
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [trace, setTrace] = useState<Interest | null>(null);
  const shownTrace = audioPoint ?? trace;
  const latest = useRef({
    viewport,
    settings,
    scene,
    items,
    active,
    onViewport,
    onSelect,
    onInteract,
  });
  latest.current = {
    viewport,
    settings,
    scene,
    items,
    active,
    onViewport,
    onSelect,
    onInteract,
  };
  const pointDrag = useRef<{
    row: NonNullable<Scene>["rows"][number];
    mode: string;
    offsetX: number;
    offsetY: number;
    tableIndex?: number;
    pointIndex: number;
  } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const dragging = useRef<{ x: number; y: number; moved: boolean } | null>(
    null,
  );
  useLayoutEffect(() => {
    const resize = () => {
      const { width, height } = host.current!.getBoundingClientRect();
      if (!width || !height) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.current!.width = Math.round(width * dpr);
      canvas.current!.height = Math.round(height * dpr);
      const v = latest.current.viewport;
      if (
        Math.abs(v.width - width) > 0.1 ||
        Math.abs(v.height - height) > 0.1
      ) {
        if (v.xLog || v.yLog || latest.current.settings.lockViewport) {
          latest.current.onViewport({ ...v, width, height });
          return;
        }
        const scale = (v.xMax - v.xMin) / v.width;
        const cx = (v.xMin + v.xMax) / 2,
          cy = (v.yMin + v.yMax) / 2;
        latest.current.onViewport({
          xMin: cx - (scale * width) / 2,
          xMax: cx + (scale * width) / 2,
          yMin: cy - (scale * height) / 2,
          yMax: cy + (scale * height) / 2,
          width,
          height,
        });
      }
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host.current!);
    resize();
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    const context = canvas.current?.getContext("2d");
    if (!context) return;
    const dpr = window.devicePixelRatio || 1;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    renderGraph(context, viewport, settings, scene, items, active, shownTrace);
  }, [viewport, settings, scene, items, active, shownTrace]);
  useEffect(() => {
    const element = host.current!;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      if (latest.current.settings.lockViewport) return;
      const rect = element.getBoundingClientRect();
      latest.current.onViewport(
        zoomViewport(
          latest.current.viewport,
          Math.exp(Math.max(-120, Math.min(120, event.deltaY)) * 0.002),
          event.clientX - rect.left,
          event.clientY - rect.top,
        ),
      );
      setTrace(null);
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, []);
  function locate(x: number, y: number) {
    const { scene, viewport: v, items } = latest.current;
    if (!scene) return;
    let nearest: { distance: number; point: Interest; id: string } | null =
      null;
    const consider = (point: Interest, id: string, bonus = 0) => {
      const distance =
        Math.hypot(px(point.x, v) - x, py(point.y, v) - y) - bonus;
      if (distance < 18 && (!nearest || distance < nearest.distance))
        nearest = { distance, point, id };
    };
    for (const row of scene.rows) {
      if (graphItem(items, row.id)?.hidden) continue;
      for (const g of row.geometry) {
        if (g.kind === "triangles") continue;
        let previous: [number, number] | null = null;
        for (let i = g.start; i + 1 < g.start + g.count; i += 2) {
          const a = scene.data[i],
            b = scene.data[i + 1];
          if (!Number.isFinite(a + b)) {
            previous = null;
            continue;
          }
          consider({ x: a, y: b, kind: "trace" }, row.id);
          if (
            previous &&
            g.kind !== "points" &&
            (g.kind !== "segments" || (i - g.start) % 4 === 2)
          ) {
            const ax = px(previous[0], v),
              ay = py(previous[1], v),
              bx = px(a, v),
              by = py(b, v);
            const t = Math.max(
              0,
              Math.min(
                1,
                ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) /
                  ((bx - ax) ** 2 + (by - ay) ** 2),
              ),
            );
            consider(
              {
                x: previous[0] + t * (a - previous[0]),
                y: previous[1] + t * (b - previous[1]),
                kind: "trace",
              },
              row.id,
            );
          }
          previous = [a, b];
        }
      }
      for (const point of row.points) consider(point, row.id, 7);
    }
    const found = nearest as {
      distance: number;
      point: Interest;
      id: string;
    } | null;
    if (found) {
      setTrace(found.point);
      onSelect(found.id.split(/:plot:|:regression/)[0]);
    } else setTrace(null);
  }
  return (
    <div className="graph-canvas" ref={host}>
      <canvas
        ref={canvas}
        tabIndex={0}
        aria-label="Graph. Drag to pan, scroll to zoom. Use arrow keys to pan and plus or minus to zoom."
        onPointerDown={(e) => {
          onInteract();
          canvas.current!.setPointerCapture(e.pointerId);
          pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          const rect = host.current!.getBoundingClientRect();
          const sx = e.clientX - rect.left,
            sy = e.clientY - rect.top;
          let distance = 15;
          for (const row of scene?.rows ?? []) {
            const item = graphItem(items, row.id);
            if (!item || item.hidden) continue;
            const style = itemPlotStyle(item, row.id),
              mode = style.dragMode ?? row.defaultDragMode ?? "none";
            if (
              mode === "none" ||
              (item.type !== "table" &&
                !row.drag?.some(Boolean) &&
                !row.pointDrag?.some((p) => p.some(Boolean)))
            )
              continue;
            for (const g of row.geometry) {
              if (g.kind !== "points" || !g.count) continue;
              for (let point = g.start; point < g.start + g.count; point += 2) {
                const x = scene!.data[point],
                  y = scene!.data[point + 1];
                const d = Math.hypot(
                  px(x, viewport) - sx,
                  py(y, viewport) - sy,
                );
                if (d < distance) {
                  distance = d;
                  pointDrag.current = {
                    row,
                    mode,
                    pointIndex: (point - g.start) / 2,
                    offsetX: sx - px(x, viewport),
                    offsetY: sy - py(y, viewport),
                    tableIndex:
                      item.type === "table"
                        ? (() => {
                            const c =
                              row.id === item.id
                                ? 1
                                : Number(row.id.split(":plot:")[1]);
                            const xs =
                              scene!.rows.find(
                                (r) => r.id === `${item.id}-col-0`,
                              )?.listValues ?? [];
                            const ys =
                              scene!.rows.find(
                                (r) => r.id === `${item.id}-col-${c}`,
                              )?.listValues ?? [];
                            return xs.findIndex(
                              (v, i) =>
                                Math.abs(Number(v) - x) < 1e-9 &&
                                Math.abs(Number(ys[i]) - y) < 1e-9,
                            );
                          })()
                        : undefined,
                  };
                  onSelect(item.id);
                }
              }
            }
          }

          dragging.current = { x: e.clientX, y: e.clientY, moved: false };
        }}
        onPointerMove={(e) => {
          const old = pointers.current.get(e.pointerId);
          if (!old || !dragging.current) return;
          if (pointDrag.current) {
            const r = host.current!.getBoundingClientRect(),
              p = pointDrag.current,
              v = latest.current.viewport;
            const x = worldX(e.clientX - r.left - p.offsetX, v),
              y = worldY(e.clientY - r.top - p.offsetY, v);
            onItems(
              dragPoint(
                latest.current.items,
                p.row,
                p.mode,
                x,
                y,
                p.tableIndex,
                p.pointIndex,
                latest.current.scene,
              ),
            );
            dragging.current.moved = true;
            setTrace({ x, y, kind: "point" });
            return;
          }
          if (settings.lockViewport) return;
          const current = { x: e.clientX, y: e.clientY };
          const v = latest.current.viewport;
          if (pointers.current.size === 2) {
            const other = [...pointers.current.entries()].find(
              ([id]) => id !== e.pointerId,
            )![1];
            const before = Math.hypot(old.x - other.x, old.y - other.y),
              after = Math.hypot(current.x - other.x, current.y - other.y);
            const r = host.current!.getBoundingClientRect();
            if (before > 0 && after > 0)
              onViewport(
                zoomViewport(
                  v,
                  before / after,
                  (current.x + other.x) / 2 - r.left,
                  (current.y + other.y) / 2 - r.top,
                ),
              );
          } else {
            onViewport(panViewport(v, old.x - current.x, old.y - current.y));
          }
          if (
            Math.hypot(
              e.clientX - dragging.current.x,
              e.clientY - dragging.current.y,
            ) > 3
          )
            dragging.current.moved = true;
          pointers.current.set(e.pointerId, current);
        }}
        onPointerUp={(e) => {
          if (dragging.current && !dragging.current.moved) {
            const r = host.current!.getBoundingClientRect();
            locate(e.clientX - r.left, e.clientY - r.top);
          }
          pointDrag.current = null;
          pointers.current.delete(e.pointerId);
          if (!pointers.current.size) dragging.current = null;
        }}
        onPointerCancel={(e) => {
          pointDrag.current = null;
          pointers.current.delete(e.pointerId);
          dragging.current = null;
        }}
        onDoubleClick={(e) => {
          if (settings.lockViewport) return;
          const rect = host.current!.getBoundingClientRect();
          onViewport(
            zoomViewport(
              viewport,
              0.5,
              e.clientX - rect.left,
              e.clientY - rect.top,
            ),
          );
        }}
        onKeyDown={(e) => {
          if (settings.lockViewport) return;
          if (e.key === "+" || e.key === "=") {
            e.preventDefault();
            onViewport(zoomViewport(viewport, 0.8));
          }
          if (e.key === "-") {
            e.preventDefault();
            onViewport(zoomViewport(viewport, 1.25));
          }
          if (e.key.startsWith("Arrow")) {
            e.preventDefault();
            const dx =
              viewport.width *
              0.05 *
              (e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0);
            const dy =
              viewport.height *
              0.05 *
              (e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0);
            onViewport(panViewport(viewport, dx, dy));
          }
          if (e.key === "Escape") setTrace(null);
        }}
      />
      {(scene?.rows ?? []).flatMap((row) => {
        const item = graphItem(items, row.id);
        if (!item || item.hidden) return [];
        const style = itemPlotStyle(item, row.id);
        if (!style.showLabel) return [];
        return row.geometry
          .filter((g) => g.kind === "points")
          .flatMap((g) =>
            Array.from({ length: Math.min(1000, g.count / 2) }, (_, index) => {
              const x = scene!.data[g.start + index * 2],
                y = scene!.data[g.start + index * 2 + 1],
                sx = px(x, viewport),
                sy = py(y, viewport);
              if (!Number.isFinite(sx + sy)) return null;
              const orientation = style.labelOrientation ?? "default",
                left = orientation.includes("left"),
                right = orientation.includes("right"),
                above =
                  orientation.includes("above") || orientation === "default",
                below = orientation.includes("below");
              const text =
                  row.label ||
                  `(${formatCoordinate(x)},${formatCoordinate(y)})`,
                math =
                  !row.label || (text.startsWith("`") && text.endsWith("`"));
              return (
                <span
                  className="point-graph-label"
                  key={`${row.id}-${index}`}
                  style={{
                    left: sx + (right ? 10 : left ? -10 : 0),
                    top: sy + (above ? -14 : below ? 14 : 0),
                    fontSize: Math.max(
                      1,
                      Math.min(
                        200,
                        styleValue(row, "labelSize", index, 1) * 20,
                      ),
                    ),
                    color:
                      row.strokeColors?.[index] ??
                      row.strokeColors?.[0] ??
                      item.color,
                    transform: `translate(${left ? "-100%" : right ? "0" : "-50%"},${above ? "-100%" : below ? "0" : "-50%"}) rotate(${styleValue(row, "labelAngle", index, 0)}rad)`,
                    textShadow:
                      style.labelOutline === false ? "none" : undefined,
                  }}
                >
                  {math ? (
                    <MathText latex={text.replace(/^`|`$/g, "")} />
                  ) : (
                    text
                  )}
                </span>
              );
            }),
          );
      })}
      {shownTrace && (
        <div
          className="coordinate-label"
          style={{
            left: Math.max(
              8,
              Math.min(viewport.width - 195, px(shownTrace.x, viewport) + 13),
            ),
            top: Math.max(
              8,
              py(shownTrace.y, viewport) + (audioPoint ? 5 : -44),
            ),
          }}
          role="status"
        >
          <MathText
            latex={`(${formatCoordinate(shownTrace.x)},${formatCoordinate(shownTrace.y)})`}
          />
          {!audioPoint && (
            <button
              aria-label="Close coordinates"
              onClick={() => setTrace(null)}
            >
              ×
            </button>
          )}
        </div>
      )}
    </div>
  );
}
