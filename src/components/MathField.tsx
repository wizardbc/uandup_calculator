import { useLayoutEffect, useRef } from "react";
import {
  MathField as createField,
  StaticMath as createStatic,
  bundledLocalize,
  type MathFieldAPI,
} from "virtual:desquill";

export type MathAPI = MathFieldAPI;
const localize = (key: string, variables: unknown) =>
  bundledLocalize(key, variables, "en");
const operatorNames =
  "sin cos tan sec csc cot arcsin arccos arctan sinh cosh tanh ln log exp abs min max mean median total length count stdev stdevp variance var floor ceil round sign mod nCr nPr gcd lcm quantile sort unique join derivative integral sum product normaldist binomialdist normalcdf normalpdf ans";
export function MathField({
  latex,
  label,
  onChange,
  onFocus,
  onEnter,
  onMove,
  onEmptyBackspace,
  register,
  className = "",
}: {
  latex: string;
  label: string;
  onChange: (latex: string) => void;
  onFocus?: () => void;
  onEnter?: () => void;
  onMove?: (direction: -1 | 1) => void;
  onEmptyBackspace?: () => void;
  register?: (api: MathAPI | null) => void;
  className?: string;
}) {
  const container = useRef<HTMLSpanElement>(null);
  const api = useRef<MathAPI | null>(null);
  const callbacks = useRef({
    onChange,
    onFocus,
    onEnter,
    onMove,
    onEmptyBackspace,
    register,
  });
  callbacks.current = {
    onChange,
    onFocus,
    onEnter,
    onMove,
    onEmptyBackspace,
    register,
  };
  const changing = useRef(false);
  const lastLatex = useRef(latex);
  useLayoutEffect(() => {
    const host = document.createElement("span");
    container.current!.appendChild(host);
    let routeKey: (key: string, event?: KeyboardEvent) => void = () => {};
    const field = createField(host, {
      localize,
      autoCommands: "pi theta sqrt sum prod int infinity",
      autoOperatorNames: operatorNames,
      autoSubscriptNumerals: true,
      restrictMismatchedBrackets: true,
      charsThatBreakOutOfSupSub: "+-=<>",
      supSubsRequireOperand: true,
      maxDepth: 32,
      overrideKeystroke: (key: string, event: KeyboardEvent) =>
        routeKey(key, event),
    });
    api.current = field;
    const originalKeystroke = field.keystroke.bind(field);
    routeKey = (key, event) => {
      if (key === "Enter") {
        event?.preventDefault();
        callbacks.current.onEnter?.();
        return;
      }
      if (key === "Backspace" && !field.latex()) {
        event?.preventDefault();
        callbacks.current.onEmptyBackspace?.();
        return;
      }
      const before = JSON.stringify(field.selection());
      originalKeystroke(key);
      if (
        (key === "Up" || key === "Down") &&
        JSON.stringify(field.selection()) === before
      )
        callbacks.current.onMove?.(key === "Up" ? -1 : 1);
      if (
        [
          "Left",
          "Right",
          "Up",
          "Down",
          "Backspace",
          "Del",
          "Home",
          "End",
          "Ctrl-A",
        ].includes(key)
      )
        event?.preventDefault();
    };
    field.keystroke = (key: string) => {
      routeKey(key);
      return field;
    };
    field.setAriaLabel(label);
    const textarea = host.querySelector("textarea")!;
    textarea.setAttribute("aria-label", label);
    textarea.addEventListener("focus", () => callbacks.current.onFocus?.());
    changing.current = true;
    field.latex(latex);
    lastLatex.current = field.latex();
    changing.current = false;
    const unsubscribe = field.subscribeToChanges(() => {
      const value = field.latex();
      if (!changing.current && value !== lastLatex.current) {
        lastLatex.current = value;
        callbacks.current.onChange(value);
      }
    });
    callbacks.current.register?.(field);
    return () => {
      unsubscribe();
      callbacks.current.register?.(null);
      field.blur();
      host.remove();
      api.current = null;
    };
  }, []);
  useLayoutEffect(() => {
    if (api.current && api.current.latex() !== latex) {
      changing.current = true;
      api.current.latex(latex);
      lastLatex.current = api.current.latex();
      changing.current = false;
    }
  }, [latex]);
  return (
    <span
      ref={container}
      className={`math-field ${className}`}
      onPointerDown={() => callbacks.current.onFocus?.()}
    />
  );
}
export function MathText({
  latex,
  className = "",
}: {
  latex: string;
  className?: string;
}) {
  const container = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const host = document.createElement("span");
    container.current!.appendChild(host);
    createStatic(host, { localize, autoOperatorNames: operatorNames }).latex(
      latex,
    );
    return () => host.remove();
  }, [latex]);
  return <span ref={container} className={`math-text ${className}`} />;
}
