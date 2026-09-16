import { useEffect, useMemo, useRef, useState } from "react";
import type { Item, Scene, Interest, Viewport } from "../types";
import { graphItem, axisValue, formatCoordinate } from "../graph/render";
import { traceAt, traceCurve, TraceSound } from "../engine/audioTrace";
import { Icon } from "./Icons";
export function AudioTrace({
  scene,
  items,
  active,
  viewport,
  onSelect,
  onTrace,
  onClose,
  onItems,
}: {
  scene: Scene | null;
  items: Item[];
  active: string | null;
  viewport: Viewport;
  onSelect: (id: string) => void;
  onTrace: (p: Interest | null) => void;
  onClose: () => void;
  onItems: (items: Item[]) => void;
}) {
  const root = useRef<HTMLDivElement>(null),
    sound = useRef(new TraceSound());
  const [volume, setVolume] = useState(50),
    [speed, setSpeed] = useState(1),
    [fraction, setFraction] = useState(0.5),
    [playing, setPlaying] = useState(false),
    [announcement, setAnnouncement] = useState(
      "Audio trace on. Use Arrow keys to navigate. To hear the graph, press H.",
    ),
    [slider, setSlider] = useState<string | null>(null);
  const rows = useMemo(
    () =>
      scene?.rows.filter(
        (r) => r.geometry.length && !graphItem(items, r.id)?.hidden,
      ) ?? [],
    [scene, items],
  );
  const index = Math.max(
      0,
      rows.findIndex(
        (r) => r.id === active || r.id.split(":plot:")[0] === active,
      ),
    ),
    row = rows[index];
  const curve = useMemo(
    () => (scene && row ? traceCurve(scene, row) : null),
    [scene, row],
  );
  const points = curve ? traceAt(curve, viewport, fraction) : [];
  const point = points[0] ?? null;
  const latest = useRef({});
  latest.current = {};
  const describePoint = () =>
    setAnnouncement(
      point
        ? `${point.kind === "trace" ? "Point" : point.kind}. X: ${formatCoordinate(point.x)}. Y: ${formatCoordinate(point.y)}.`
        : "No point on this part of the graph.",
    );
  const describeCurve = () => {
    const item = row ? graphItem(items, row.id) : undefined;
    setAnnouncement(
      item?.type === "expression"
        ? `Expression ${items.findIndex((i) => i.id === item.id) + 1}: ${item.plotStyle?.screenReaderLabel || item.latex}`
        : item
          ? "Table points."
          : "No graph to trace.",
    );
  };
  const describeAxes = () =>
    setAnnouncement(
      `X axis: ${formatCoordinate(viewport.xMin)} to ${formatCoordinate(viewport.xMax)}. Y axis: ${formatCoordinate(viewport.yMin)} to ${formatCoordinate(viewport.yMax)}.`,
    );
  useEffect(() => {
    root.current?.focus();
    return () => {
      sound.current.close();
      onTrace(null);
    };
  }, []);
  useEffect(() => {
    onTrace(point);
  }, [point?.x, point?.y]);
  useEffect(() => {
    if (!curve) return;
    const p = curve.row.points.reduce<Interest | null>(
      (best, p) =>
        !best || Math.hypot(p.x, p.y) < Math.hypot(best.x, best.y) ? p : best,
      null,
    );
    if (p) {
      const min = curve.vertical ? viewport.yMin : viewport.xMin,
        max = curve.vertical ? viewport.yMax : viewport.xMax;
      setFraction(
        Math.max(
          0,
          Math.min(1, ((curve.vertical ? p.y : p.x) - min) / (max - min)),
        ),
      );
    } else setFraction(0.5);
  }, [row?.id]);
  useEffect(() => {
    if (!playing || !curve) return;
    const duration = 5 / speed,
      start = performance.now();
    void sound.current.play(curve, viewport, volume, duration);
    let frame = 0;
    const tick = () => {
      const f = Math.min(1, (performance.now() - start) / (duration * 1000));
      setFraction(f);
      if (f < 1) frame = requestAnimationFrame(tick);
      else setPlaying(false);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      sound.current.stop();
    };
  }, [playing, curve, speed, volume]);
  function move(direction: number, interest = false) {
    setPlaying(false);
    if (slider) {
      const item = items.find((i) => i.id === slider);
      if (item?.type === "expression") {
        const before = Number(item.latex.split("=")[1]);
        const n = Math.max(
          item.sliderMin ?? -10,
          Math.min(
            item.sliderMax ?? 10,
            before + direction * (item.sliderStep ?? 1),
          ),
        );
        onItems(
          items.map((i) =>
            i.id === item.id
              ? { ...item, latex: `${item.latex.split("=")[0]}=${n}` }
              : i,
          ),
        );
        setAnnouncement(`Slider ${item.latex.split("=")[0]}: ${n}`);
      }
      return;
    }
    if (!curve) return;
    let next = Math.max(0, Math.min(1, fraction + direction * 0.01));
    if (interest) {
      const min = curve.vertical ? viewport.yMin : viewport.xMin,
        max = curve.vertical ? viewport.yMax : viewport.xMax;
      const positions = curve.row.points
        .map((p) => ({
          p,
          f: ((curve.vertical ? p.y : p.x) - min) / (max - min),
        }))
        .filter((v) =>
          direction > 0 ? v.f > fraction + 1e-6 : v.f < fraction - 1e-6,
        )
        .sort((a, b) => direction * (a.f - b.f));
      if (!positions.length) return;
      next = positions[0].f;
      setAnnouncement(
        `${positions[0].p.kind}. X: ${formatCoordinate(positions[0].p.x)}. Y: ${formatCoordinate(positions[0].p.y)}.`,
      );
    }
    setFraction(next);
    void sound.current.point(curve, viewport, next, volume);
  }
  function changeCurve(direction: number) {
    setPlaying(false);
    const next = rows[index + direction];
    if (next) {
      onSelect(next.id);
      setSlider(null);
    }
  }
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      let handled = true;
      if (k === "h") setPlaying((v) => !v);
      else if (k === "arrowleft") move(-1);
      else if (k === "arrowright") move(1);
      else if (k === "tab") move(e.shiftKey ? -1 : 1, true);
      else if (e.altKey && k === "arrowup") changeCurve(-1);
      else if (e.altKey && k === "arrowdown") changeCurve(1);
      else if (k === "v")
        setVolume((v) => Math.max(0, Math.min(100, v + (e.shiftKey ? -5 : 5))));
      else if (e.altKey && /^\d$/.test(k))
        setSpeed(k === "0" ? 4 : Number(k) * 0.4);
      else if (k === "t" && !e.altKey) describePoint();
      else if (k === "s" && e.altKey) describeCurve();
      else if (k === "g" && e.altKey) describeAxes();
      else if (k === "s") {
        const row = scene?.rows.find((r) => r.slider);
        setSlider(slider ? null : (row?.id ?? null));
        setAnnouncement(
          slider
            ? "Point navigation."
            : row
              ? `Adjusting slider ${row.slider}.`
              : "No slider available.",
        );
      } else if (k === "escape") {
        onClose();
      } else handled = false;
      if (handled) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  });
  const nav = (
    label: string,
    previous: () => void,
    next: () => void,
    icon: "left" | "collapse" | "up",
    after: "right" | "expand" | "down",
    disabledPrevious = false,
    disabledNext = false,
  ) => (
    <div className="audio-nav-row">
      <button
        aria-label={`Previous ${label}`}
        disabled={disabledPrevious}
        onClick={previous}
      >
        <Icon name={icon} />
      </button>
      <span>
        {label === "Point of Interest" ? (
          <>
            Point
            <br />
            <small>of Interest</small>
          </>
        ) : (
          label
        )}
      </span>
      <button
        aria-label={`Next ${label}`}
        disabled={disabledNext}
        onClick={next}
      >
        <Icon name={after} />
      </button>
    </div>
  );
  return (
    <div
      ref={root}
      className="audio-trace-panel"
      role="region"
      aria-label="Audio Trace"
      tabIndex={-1}
    >
      <div className="audio-trace-inner">
        <div className="audio-playback">
          <button
            className="audio-hear"
            disabled={!curve}
            onClick={() => setPlaying((v) => !v)}
          >
            <Icon name={playing ? "pause" : "play"} size={20} />
            {playing ? "Stop" : "Hear Graph"}
          </button>
          <div className="audio-nav-row">
            <button
              aria-label="Volume Down"
              onClick={() => setVolume((v) => Math.max(0, v - 5))}
            >
              <Icon name="audio" size={16} />
            </button>
            <span>
              <small>Volume</small>
              <br />
              {volume}%
            </span>
            <button
              aria-label="Volume Up"
              onClick={() => setVolume((v) => Math.min(100, v + 5))}
            >
              <Icon name="audio" size={21} />
            </button>
          </div>
          <div className="audio-nav-row">
            <button
              aria-label="Speed Down"
              onClick={() => setSpeed((v) => Math.max(0.25, v - 0.25))}
            >
              <Icon name="collapse" />
            </button>
            <span>
              <small>Speed</small>
              <br />
              {speed} x
            </span>
            <button
              aria-label="Speed Up"
              onClick={() => setSpeed((v) => Math.min(4, v + 0.25))}
            >
              <Icon name="expand" />
            </button>
          </div>
          <button
            className="audio-off"
            aria-label="audio-trace-off"
            onClick={onClose}
          >
            Audio Trace Off
          </button>
        </div>
        <div className="audio-navigation">
          <div className="audio-heading">Navigation</div>
          {nav(
            "Point",
            () => move(-1),
            () => move(1),
            "left",
            "right",
          )}
          {nav(
            "Point of Interest",
            () => move(-1, true),
            () => move(1, true),
            "collapse",
            "expand",
            !row?.points.length,
            !row?.points.length,
          )}
          {nav(
            "Curve",
            () => changeCurve(-1),
            () => changeCurve(1),
            "up",
            "down",
            index === 0,
            index >= rows.length - 1,
          )}
        </div>
        <div className="audio-descriptions">
          <div className="audio-heading">
            Screen Reader{" "}
            <span title="Describe the graph with a screen reader">❔</span>
          </div>
          <button aria-label="describe-point" onClick={describePoint}>
            Describe Point
          </button>
          <button aria-label="describe-curve" onClick={describeCurve}>
            Describe Curve
          </button>
          <button aria-label="describe-axes" onClick={describeAxes}>
            Describe Axes
          </button>
        </div>
      </div>
      <span className="sr-only" role="status" aria-live="polite">
        {announcement}
      </span>
    </div>
  );
}
