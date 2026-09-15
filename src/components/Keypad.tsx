import { useState, type ReactNode } from "react";
import { Icon } from "./Icons";
import { MathText } from "./MathField";

export type KeyAction =
  { type: "text" | "latex" | "key"; value: string } | { type: "audio" };
type Key = {
  label: ReactNode;
  aria: string;
  action: KeyAction;
  className?: string;
};
const text = (
  value: string,
  label: ReactNode = value,
  aria = value,
  cls = "",
): Key => ({ label, aria, action: { type: "text", value }, className: cls });
const latex = (value: string, label: string, aria: string, cls = ""): Key => ({
  label: <MathText latex={label} />,
  aria,
  action: { type: "latex", value },
  className: cls,
});
const key = (
  value: string,
  icon: "left" | "right" | "backspace" | "enter",
  aria: string,
  cls = "gray",
): Key => ({
  label: <Icon name={icon} size={20} />,
  aria,
  action: { type: "key", value },
  className: cls,
});
const square = latex("^{2}", "a^2", "Squared");
const power = text("^", <MathText latex="a^b" />, "Superscript");
const radical = (
  <svg width="23" height="23" viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="m2 14 4-2 3 7 8-14h6"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
    />
  </svg>
);
const root = text(
  "sqrt",
  <span className="radical-key">{radical}</span>,
  "Square Root",
);
const abs = text("|", <MathText latex="|a|" />, "Absolute Value");
const pi = latex("\\pi", "\\pi", "Pi");
const nthRoot: Key = {
  label: (
    <span className="radical-key">
      <sup>n</sup>
      {radical}
    </span>
  ),
  aria: "Nth Root",
  action: { type: "latex", value: "\\sqrt[]{}" },
};
const left = key("Left", "left", "Left Arrow");
const right = key("Right", "right", "Right Arrow");
const backspace = key("Backspace", "backspace", "Backspace", "gray backspace");
const enter = key("Enter", "enter", "Enter", "blue enter");
const num = (n: string) => text(n, n, n, "gray number");
const op = (s: string, label: string, aria: string) => text(s, label, aria);
const func = (s: string, display = `\\operatorname{${s}}`) =>
  latex(`\\operatorname{${s}}(`, display, s);
const digits: Key[][] = [
  [num("7"), num("8"), num("9"), op("/", "÷", "Divide")],
  [num("4"), num("5"), num("6"), op("*", "×", "Times")],
  [num("1"), num("2"), num("3"), op("-", "−", "Minus")],
  [num("0"), num("."), op("=", "=", "="), op("+", "+", "Plus")],
];
export const FUNCTION_GROUPS: { title: string; items: [string, string?][] }[] =
  [
    {
      title: "TRIG FUNCTIONS",
      items: [["sin"], ["cos"], ["tan"], ["csc"], ["sec"], ["cot"]],
    },
    {
      title: "INVERSE TRIG FUNCTIONS",
      items: [
        ["arcsin", "\\sin^{-1}"],
        ["arccos", "\\cos^{-1}"],
        ["arctan", "\\tan^{-1}"],
        ["arccsc", "\\csc^{-1}"],
        ["arcsec", "\\sec^{-1}"],
        ["arccot", "\\cot^{-1}"],
      ],
    },
    {
      title: "STATISTICS",
      items: [
        ["mean"],
        ["median"],
        ["min"],
        ["max"],
        ["quantile"],
        ["stdev"],
        ["stdevp"],
        ["variance", "var"],
        ["cov"],
        ["mad"],
        ["corr"],
        ["count"],
        ["total"],
      ],
    },
    {
      title: "LIST OPERATIONS",
      items: [["join"], ["sort"], ["unique"], ["length"]],
    },
    {
      title: "PROBABILITY DISTRIBUTIONS",
      items: [
        ["normaldist"],
        ["tdist"],
        ["chisqdist"],
        ["uniformdist"],
        ["binomialdist"],
        ["poissondist"],
        ["geodist"],
        ["pdf"],
        ["cdf"],
        ["inversecdf"],
      ],
    },
    {
      title: "CALCULUS",
      items: [
        ["exp"],
        ["ln"],
        ["log"],
        ["derivative"],
        ["integral"],
        ["sum"],
        ["product"],
      ],
    },
    {
      title: "HYPERBOLIC TRIG FUNCTIONS",
      items: [
        ["sinh"],
        ["cosh"],
        ["tanh"],
        ["arcsinh"],
        ["arccosh"],
        ["arctanh"],
      ],
    },
    {
      title: "NUMBER THEORY",
      items: [
        ["lcm"],
        ["gcd"],
        ["mod"],
        ["ceil"],
        ["floor"],
        ["round"],
        ["sign"],
        ["root"],
        ["nPr"],
        ["nCr"],
      ],
    },
  ];

export function Keypad({
  scientific = false,
  onKey,
  degrees,
  onDegrees,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onClear,
  onSettings,
}: {
  scientific?: boolean;
  onKey: (action: KeyAction) => void;
  degrees: boolean;
  onDegrees: (degrees: boolean) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onClear?: () => void;
  onSettings?: () => void;
}) {
  const [tab, setTab] = useState<"main" | "abc" | "func">("main");
  const [functions, setFunctions] = useState(false);
  const [shift, setShift] = useState(false);
  const button = (k: Key, index: number) => (
    <button
      type="button"
      key={index}
      className={`key ${k.className ?? ""}`}
      aria-label={k.aria}
      onPointerDown={(e) => e.preventDefault()}
      onClick={() => onKey(k.action)}
    >
      {k.label}
    </button>
  );
  const leftGraph: Key[][] = [
    [latex("x", "x", "x"), latex("y", "y", "y"), square, power],
    [text("("), text(")"), text("<"), text(">")],
    [abs, text(","), latex("\\le", "\\le", "<="), latex("\\ge", "\\ge", ">=")],
    [
      text("", "A B C", "Toggle Letters", "gray letters-toggle"),
      {
        label: <Icon name="audio" size={17} />,
        aria: "Toggle Audio Trace",
        action: { type: "audio" },
        className: "gray",
      },
      root,
      pi,
    ],
  ];
  const leftScience: Key[][] = [
    [square, power, abs],
    [root, nthRoot, pi],
    [func("sin"), func("cos"), func("tan")],
    [text("("), text(")"), text(",")],
  ];
  const functionRows = [
    [func("sin"), func("cos"), func("tan"), power, root, nthRoot],
    [
      func("arcsin", "\\sin^{-1}"),
      func("arccos", "\\cos^{-1}"),
      func("arctan", "\\tan^{-1}"),
      latex("e^{}", "e^x", "Exponential"),
      func("abs"),
      func("round"),
    ],
    [
      func("mean"),
      func("stdev"),
      func("stdevp"),
      func("ln"),
      func("log"),
      backspace,
    ],
    [
      func("nPr"),
      func("nCr"),
      text("!", "!", "Factorial"),
      latex("e", "e", "Euler’s number"),
      pi,
      enter,
    ],
  ];
  return (
    <div
      className={`keypad ${scientific ? "scientific-keypad" : "graphing-keypad"}`}
    >
      {scientific && (
        <div className="scientific-keypad-toolbar">
          <div className="keypad-tabs">
            {(["main", "abc", "func"] as const).map((t) => (
              <button
                className={tab === t ? "selected" : ""}
                key={t}
                aria-label={
                  t === "func" ? "Functions" : t === "abc" ? "A B C" : "main"
                }
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => setTab(t)}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="angle-small">
            <button
              className={!degrees ? "selected" : ""}
              onClick={() => onDegrees(false)}
            >
              RAD
            </button>
            <button
              className={degrees ? "selected" : ""}
              onClick={() => onDegrees(true)}
            >
              DEG
            </button>
          </div>
          <button
            className="sci-tool"
            aria-label="Undo"
            onClick={onUndo}
            disabled={!canUndo}
          >
            <Icon name="undo" />
          </button>
          <button
            className="sci-tool"
            aria-label="Redo"
            onClick={onRedo}
            disabled={!canRedo}
          >
            <Icon name="redo" />
          </button>
          <button className="clear-all" onClick={onClear}>
            clear all
          </button>
          <button
            className="sci-tool"
            aria-label="Settings"
            onClick={onSettings}
          >
            <Icon name="wrench" size={18} />
          </button>
        </div>
      )}
      <div className="keypad-inner">
        {tab === "abc" ? (
          <div className="alphabet-keypad">
            {["qwertyuiop", "asdfghjkl", "zxcvbnm"].map((row, i) => (
              <div className="alphabet-row" key={row}>
                {i === 2 && (
                  <button
                    className={`key gray ${shift ? "selected" : ""}`}
                    aria-label="Shift"
                    onClick={() => setShift(!shift)}
                  >
                    ⇧
                  </button>
                )}
                {row
                  .split("")
                  .map((s, j) =>
                    button(
                      latex(
                        shift ? s.toUpperCase() : s,
                        shift ? s.toUpperCase() : s,
                        s,
                      ),
                      j,
                    ),
                  )}
                {i === 2 && button(backspace, 99)}
              </div>
            ))}
            <div className="alphabet-row">
              <button className="key gray" onClick={() => setTab("main")}>
                123
              </button>
              {button(pi, 1)}
              {button(latex("\\theta", "\\theta", "Theta"), 2)}
              {button(text("_", <MathText latex="a_b" />, "Subscript"), 3)}
              {button(text(","), 4)}
              {button(left, 5)}
              {button(right, 6)}
              {button(enter, 7)}
            </div>
          </div>
        ) : scientific && tab === "func" ? (
          <div className="science-functions">
            {functionRows.map((row, i) => (
              <div className="science-function-row" key={i}>
                {row.map(button)}
              </div>
            ))}
          </div>
        ) : (
          <div className="main-keypad">
            {(scientific ? leftScience : leftGraph).map((leftKeys, row) => (
              <div className="keypad-row" key={row}>
                <div
                  className={`key-group functions-group ${scientific ? "three" : "four"}`}
                >
                  {leftKeys.map((k, i) =>
                    k.aria === "Toggle Letters" ? (
                      <button
                        key={i}
                        className="key gray alphabet-toggle"
                        onPointerDown={(e) => e.preventDefault()}
                        onClick={() => setTab("abc")}
                      >
                        A B C
                      </button>
                    ) : (
                      button(k, i)
                    ),
                  )}
                </div>
                <div className="key-gap" />
                <div className="key-group four numbers-group">
                  {digits[row].map((k, i) =>
                    button(
                      scientific && row === 3 && i === 2
                        ? latex(
                            "\\operatorname{ans}",
                            "\\operatorname{ans}",
                            "Answer",
                          )
                        : k,
                      i,
                    ),
                  )}
                </div>
                <div className="key-gap" />
                <div className="key-group two actions-group">
                  {row === 0 ? (
                    scientific ? (
                      <>
                        {button(text("%", "%", "Percent Of"), 0)}
                        {button(
                          latex("\\frac{}{}", "\\frac{a}{b}", "A over B"),
                          1,
                        )}
                      </>
                    ) : (
                      <button
                        className={`key gray functions-toggle ${functions ? "selected" : ""}`}
                        aria-label="Functions"
                        aria-expanded={functions}
                        onPointerDown={(e) => e.preventDefault()}
                        onClick={() => setFunctions(!functions)}
                      >
                        functions
                      </button>
                    )
                  ) : row === 1 ? (
                    <>
                      {button(left, 0)}
                      {button(right, 1)}
                    </>
                  ) : row === 2 ? (
                    button(backspace, 0)
                  ) : (
                    button(enter, 0)
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        {functions && (
          <div
            className="functions-popover popover"
            role="dialog"
            aria-label="Functions"
          >
            {FUNCTION_GROUPS.map((group) => (
              <section key={group.title}>
                <h3>{group.title}</h3>
                <div className="function-grid">
                  {group.items.map(([name, display], i) =>
                    button(func(name, display ?? `\\operatorname{${name}}`), i),
                  )}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
