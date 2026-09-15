import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { GraphSettings, Item, Scene, Viewport, Interest } from "../types";
import {
  renderGraph,
  px,
  py,
  worldX,
  worldY,
  formatCoordinate,
} from "./render";
import { MathText } from "../components/MathField";

export function zoomViewport(
  view: Viewport,
  factor: number,
  atX = view.width / 2 + 0.5,
  atY = view.height / 2 + 0.5,
): Viewport {
  const x = worldX(atX, view),
    y = worldY(atY, view);
  const span = (view.xMax - view.xMin) * factor;
  if (span < 1e-10 || span > 1e14) return view;
  return {
    ...view,
    xMin: x + (view.xMin - x) * factor,
    xMax: x + (view.xMax - x) * factor,
    yMin: y + (view.yMin - y) * factor,
    yMax: y + (view.yMax - y) * factor,
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
}: {
  viewport: Viewport;
  settings: GraphSettings;
  scene: Scene | null;
  items: Item[];
  active: string | null;
  onViewport: (viewport: Viewport) => void;
  onSelect: (id: string) => void;
  onInteract: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [trace, setTrace] = useState<Interest | null>(null);
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
    renderGraph(context, viewport, settings, scene, items, active, trace);
  }, [viewport, settings, scene, items, active, trace]);
  useEffect(() => {
    const element = host.current!;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
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
      if (items.find((i) => i.id === row.id)?.hidden) continue;
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
      onSelect(found.id);
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
          dragging.current = { x: e.clientX, y: e.clientY, moved: false };
        }}
        onPointerMove={(e) => {
          const old = pointers.current.get(e.pointerId);
          if (!old || !dragging.current) return;
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
            const dx = ((old.x - current.x) * (v.xMax - v.xMin)) / v.width,
              dy = ((current.y - old.y) * (v.yMax - v.yMin)) / v.height;
            onViewport({
              ...v,
              xMin: v.xMin + dx,
              xMax: v.xMax + dx,
              yMin: v.yMin + dy,
              yMax: v.yMax + dy,
            });
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
          pointers.current.delete(e.pointerId);
          if (!pointers.current.size) dragging.current = null;
        }}
        onPointerCancel={(e) => {
          pointers.current.delete(e.pointerId);
          dragging.current = null;
        }}
        onDoubleClick={(e) => {
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
              (viewport.xMax - viewport.xMin) *
              0.05 *
              (e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0);
            const dy =
              (viewport.yMax - viewport.yMin) *
              0.05 *
              (e.key === "ArrowUp" ? 1 : e.key === "ArrowDown" ? -1 : 0);
            onViewport({
              ...viewport,
              xMin: viewport.xMin + dx,
              xMax: viewport.xMax + dx,
              yMin: viewport.yMin + dy,
              yMax: viewport.yMax + dy,
            });
          }
          if (e.key === "Escape") setTrace(null);
        }}
      />
      {trace && (
        <div
          className="coordinate-label"
          style={{
            left: Math.max(
              8,
              Math.min(viewport.width - 195, px(trace.x, viewport) + 13),
            ),
            top: Math.max(8, py(trace.y, viewport) - 44),
          }}
          role="status"
        >
          <MathText
            latex={`(${formatCoordinate(trace.x)},${formatCoordinate(trace.y)})`}
          />
          <button aria-label="Close coordinates" onClick={() => setTrace(null)}>
            ×
          </button>
        </div>
      )}
    </div>
  );
}
