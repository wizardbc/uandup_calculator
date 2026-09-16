import { useEffect, useRef, useState } from "react";
import type { Expression, RowResult } from "../types";
import { MathField, MathText } from "./MathField";
import { Icon } from "./Icons";
import { numberLatex } from "./resultLatex";

const modes = [
  "LOOP_FORWARD_REVERSE",
  "LOOP_FORWARD",
  "PLAY_ONCE",
  "PLAY_INDEFINITELY",
] as const;
const labels = [
  "Loop forwards and backwards",
  "Repeat in one direction",
  "Play once",
  "Play indefinitely",
];
function AnimationIcon({ mode }: { mode: string }) {
  const i = modes.indexOf(mode as (typeof modes)[number]);
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M5 7h14m-3-3 3 3-3 3" />
        {i === 0 ? (
          <path d="M19 17H5m3-3-3 3 3 3" />
        ) : i === 1 ? (
          <path d="M5 17h14m-3-3 3 3-3 3" />
        ) : i === 2 ? (
          <>
            <path d="M5 17h14" />
            <path d="M5 14v6M19 14v6" />
          </>
        ) : (
          <path d="M4 17h1m3 0h1m3 0h1m3 0h1m3 0h1" />
        )}
      </g>
    </svg>
  );
}
export function Slider({
  item,
  result,
  onChange,
}: {
  item: Expression;
  result: RowResult;
  onChange: (item: Expression) => void;
}) {
  const [playing, setPlaying] = useState(false);
  const [menu, setMenu] = useState(false);
  const [limits, setLimits] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const latest = useRef({ item, result, onChange });
  latest.current = { item, result, onChange };
  const direction = useRef(1);
  const bounds = result.sliderBounds ?? {
    min: item.sliderMin ?? Math.min(-10, result.value ?? 0),
    max: item.sliderMax ?? Math.max(10, result.value ?? 0),
    step: item.sliderStep ?? null,
    error: null,
  };
  const speeds = [
    0.05, 0.1, 0.15, 0.2, 0.35, 0.5, 0.75, 1, 1.5, 2, 3.5, 5, 7.5, 10, 15, 20,
  ];
  const speed = item.sliderSpeed ?? 1;
  const mode = item.sliderLoopMode ?? modes[0];
  useEffect(() => {
    if (!menu && !limits) return;
    const close = (e: Event) => {
      if (!root.current?.contains(e.target as Node)) {
        setMenu(false);
        setLimits(false);
      }
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenu(false);
        setLimits(false);
      }
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("focusin", close);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("focusin", close);
      window.removeEventListener("keydown", key);
    };
  }, [menu, limits]);
  useEffect(() => {
    if (!playing) return;
    let previous = performance.now(),
      lastFrame = previous,
      frame = 0;
    const initial = latest.current;
    const fixedMin = initial.result.sliderBounds?.min ?? -10;
    const fixedMax = initial.result.sliderBounds?.max ?? 10;
    let position =
      initial.item.sliderLoopMode === "PLAY_ONCE" &&
      (initial.result.value ?? 0) >= fixedMax
        ? fixedMin
        : (initial.result.value ?? 0);
    const tick = (now: number) => {
      const { item, result, onChange } = latest.current;
      const b = result.sliderBounds ?? {
        min: item.sliderMin ?? -10,
        max: item.sliderMax ?? 10,
        step: item.sliderStep ?? null,
        error: null,
      };
      const dt = Math.min((now - previous) / 1000, 0.1);
      previous = now;
      const mode = item.sliderLoopMode ?? modes[0],
        span = mode === modes[3] ? fixedMax - fixedMin : b.max - b.min;
      if (!(span > 0) || b.error) {
        setPlaying(false);
        return;
      }
      position +=
        ((dt * span) / 4) *
        (item.sliderSpeed ?? 1) *
        (mode === modes[0] ? direction.current : 1);
      if (mode === modes[0]) {
        if (position > b.max) {
          position = b.max - (position - b.max);
          direction.current = -1;
        }
        if (position < b.min) {
          position = b.min + (b.min - position);
          direction.current = 1;
        }
      } else if (mode === modes[1] && position > b.max)
        position = b.min + ((position - b.min) % span);
      else if (mode === modes[2] && position >= b.max) {
        position = b.max;
        setPlaying(false);
      }
      if (now - lastFrame >= 30 || (mode === modes[2] && position === b.max)) {
        let value = b.step
          ? b.min + Math.round((position - b.min) / b.step) * b.step
          : position;
        if (mode !== modes[3]) value = Math.max(b.min, Math.min(b.max, value));
        onChange({
          ...item,
          latex: `${item.latex.split("=")[0]}=${numberLatex(Number(value.toPrecision(10)))}`,
        });
        lastFrame = now;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);
  const start = () => {
    if (!playing && mode === modes[2] && (result.value ?? 0) >= bounds.max)
      onChange({
        ...item,
        latex: `${item.latex.split("=")[0]}=${numberLatex(bounds.min)}`,
      });
    setPlaying(!playing);
  };
  return (
    <div ref={root} className="slider-area">
      <button
        className="slider-play"
        aria-label={playing ? "Pause slider" : "Play slider"}
        onClick={start}
        disabled={!!bounds.error}
      >
        <Icon name={playing ? "pause" : "play"} size={17} />
      </button>
      <button
        className="slider-menu-opener"
        aria-label="Animation properties"
        aria-expanded={menu}
        onClick={() => {
          setMenu(!menu);
          setLimits(false);
        }}
      >
        <AnimationIcon mode={mode} />
      </button>
      {limits ? (
        <div className="slider-limits">
          <MathField
            label="Slider Minimum:"
            latex={
              item.sliderMinLatex ??
              (item.sliderMin === undefined ? "" : numberLatex(item.sliderMin))
            }
            onChange={(sliderMinLatex) =>
              onChange({ ...item, sliderMinLatex, sliderMin: undefined })
            }
          />
          <MathText latex={`\\le ${item.latex.split("=")[0]}\\le`} />
          <MathField
            label="Slider Maximum:"
            latex={
              item.sliderMaxLatex ??
              (item.sliderMax === undefined ? "" : numberLatex(item.sliderMax))
            }
            onChange={(sliderMaxLatex) =>
              onChange({ ...item, sliderMaxLatex, sliderMax: undefined })
            }
          />
          <span className="slider-step-label">Step:</span>
          <MathField
            label="Slider Step Size:"
            latex={
              item.sliderStepLatex ??
              (item.sliderStep === undefined
                ? ""
                : numberLatex(item.sliderStep))
            }
            onChange={(sliderStepLatex) =>
              onChange({ ...item, sliderStepLatex, sliderStep: undefined })
            }
          />
        </div>
      ) : (
        <div className="slider-track">
          <button
            aria-label="Slider minimum"
            onClick={() => {
              setLimits(true);
              setMenu(false);
            }}
          >
            {bounds.min}
          </button>
          <input
            type="range"
            aria-label={`Slider ${result.slider}`}
            min={bounds.min}
            max={bounds.max}
            step={bounds.step ?? "any"}
            value={result.value ?? 0}
            disabled={!!bounds.error}
            onChange={(e) =>
              onChange({
                ...item,
                latex: `${item.latex.split("=")[0]}=${numberLatex(Number(e.target.value))}`,
              })
            }
          />
          <button
            aria-label="Slider maximum"
            onClick={() => {
              setLimits(true);
              setMenu(false);
            }}
          >
            {bounds.max}
          </button>
        </div>
      )}
      {bounds.error && (
        <div className="slider-error" role="status">
          {bounds.error}
        </div>
      )}
      {menu && (
        <div
          className="slider-animation-menu popover"
          role="dialog"
          aria-label="Animation properties"
        >
          <div>Animation Mode</div>
          <div className="animation-modes">
            {modes.map((m, i) => (
              <button
                key={m}
                aria-label={labels[i]}
                role="radio"
                aria-checked={mode === m}
                onClick={() => {
                  direction.current = 1;
                  onChange({ ...item, sliderLoopMode: m });
                }}
              >
                <AnimationIcon mode={m} />
              </button>
            ))}
          </div>
          <div>Speed</div>
          <div className="animation-speed">
            <button
              aria-label="Animate Slower"
              disabled={speed <= speeds[0]}
              onClick={() =>
                onChange({
                  ...item,
                  sliderSpeed:
                    [...speeds].reverse().find((s) => s < speed) ?? speeds[0],
                })
              }
            >
              «
            </button>
            <span>{speed}x</span>
            <button
              aria-label="Animate Faster"
              disabled={speed >= speeds[speeds.length - 1]}
              onClick={() =>
                onChange({
                  ...item,
                  sliderSpeed:
                    speeds.find((s) => s > speed) ?? speeds[speeds.length - 1],
                })
              }
            >
              »
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
