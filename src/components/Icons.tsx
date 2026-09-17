import type { CSSProperties } from "react";
export type IconName =
  | "plus"
  | "minus"
  | "close"
  | "undo"
  | "redo"
  | "gear"
  | "wrench"
  | "collapse"
  | "expand"
  | "keyboard"
  | "down"
  | "up"
  | "left"
  | "right"
  | "backspace"
  | "enter"
  | "home"
  | "table"
  | "curve"
  | "play"
  | "pause"
  | "audio"
  | "check"
  | "warning"
  | "fullscreen";
const paths: Record<IconName, string> = {
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  close: "M5 5l14 14M19 5L5 19",
  undo: "M4 11C8 3 17 4 21 10M4 5v7h7",
  redo: "M20 11C16 3 7 4 3 10M20 5v7h-7",
  gear: "M10 3h4l1 3 3-1 2 3-2 2 3 2-1 4-3 0-1 3h-4l-1-3-3 1-2-3 2-2-3-2 1-4 3 0z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  wrench:
    "M20 4l-4 4-3-3 4-4a6 6 0 0 0-7 8L3 17a2.5 2.5 0 0 0 4 4l7-8a6 6 0 0 0 6-9",
  collapse: "M11 5l-6 7 6 7M19 5l-6 7 6 7",
  expand: "M5 5l6 7-6 7M13 5l6 7-6 7",
  keyboard:
    "M2 5h20v14H2zM5 8h1m3 0h1m3 0h1m3 0h1M5 11h1m3 0h1m3 0h1m3 0h1M6 15h12",
  down: "M6 9l6 6 6-6",
  up: "M6 15l6-6 6 6",
  left: "M19 12H5m5-5-5 5 5 5",
  right: "M5 12h14m-5-5 5 5-5 5",
  backspace: "M8 6h13v12H8l-6-6zM11 9l6 6m0-6-6 6",
  enter: "M20 7v5H4m5-5-5 5 5 5",
  home: "M3 11l9-8 9 8M6 10v11h12V10M10 21v-7h4v7",
  table: "M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18",
  curve: "M1 14C4 2 7 2 11 13S18 25 23 10",
  play: "M8 4l12 8-12 8z",
  pause: "M8 5v14M16 5v14",
  audio: "M3 10h4l5-4v12l-5-4H3zM16 8q6 4 0 8M19 5q9 7 0 14",
  check: "M4 12l5 5L21 5",
  warning: "M12 3L2 21h20zM12 9v5m0 3v1",
  fullscreen: "M9 3H3v6M15 3h6v6M3 15v6h6M21 15v6h-6",
};
export function Icon({
  name,
  size = 22,
  style,
}: {
  name: IconName;
  size?: number;
  style?: CSSProperties;
}) {
  if (name === "backspace")
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        aria-hidden="true"
        style={style}
      >
        <path fill="currentColor" stroke="none" d="M8 6h13v12H8l-6-6z" />
        <path
          fill="none"
          stroke="var(--icon-cutout, #fff)"
          strokeWidth="1.8"
          d="m11 9 6 6m0-6-6 6"
        />
      </svg>
    );
  if (name === "undo" || name === "redo")
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        aria-hidden="true"
        style={style}
      >
        <g
          transform={
            name === "redo" ? "translate(24 0) scale(-1 1)" : undefined
          }
          fill="currentColor"
        >
          <path d="M2 6v11h10l-4-4c4-6 9-5 14-1-2-7-10-10-17-3z" />
        </g>
      </svg>
    );
  if (name === "down" || name === "up")
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        aria-hidden="true"
        style={style}
        fill="currentColor"
      >
        <path d={name === "down" ? "M3 8h18l-9 10z" : "M3 16h18l-9-10z"} />
      </svg>
    );
  if (name === "gear")
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        aria-hidden="true"
        style={style}
        fill="currentColor"
        fillRule="evenodd"
      >
        <path d="m10 2 4 0 .6 3 2 .9 2.6-1.4 2 3.5-2.1 2.1.1 2.5 2.3 1.7-2 3.5-2.8-.9-2.1 1.2-.6 3.4h-4l-.6-3.4-2.1-1.2-2.8.9-2-3.5 2.3-1.7.1-2.5L2.8 8l2-3.5 2.6 1.4 2-.9zm6 10a4 4 0 1 0-8 0 4 4 0 0 0 8 0" />
      </svg>
    );
  if (name === "wrench")
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        aria-hidden="true"
        style={style}
        fill="currentColor"
        fillRule="evenodd"
      >
        <path d="M21 3 16 7l-3-3 4-3a6 6 0 0 0-7 8L3 17a3 3 0 0 0 4 4l7-8a6 6 0 0 0 7-10M6 18a1 1 0 1 0 0 2 1 1 0 0 0 0-2" />
      </svg>
    );
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      style={style}
      fill="none"
      stroke="currentColor"
      strokeWidth={name === "plus" || name === "close" ? 3.6 : 2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[name]} />
    </svg>
  );
}
