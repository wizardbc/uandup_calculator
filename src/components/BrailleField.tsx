import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { MathAPI } from "./MathField";
import { translateBraille } from "../accessibility/client";
import { brailleToLatex, sixDotCells } from "../accessibility/braille";
export function BrailleField({
  latex,
  label,
  onChange,
  onFocus,
  onEnter,
  onMove,
  onEmptyBackspace,
  register,
  className = "",
  code,
  sixKey,
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
  code: "Nemeth" | "UEB";
  sixKey: boolean;
}) {
  const input = useRef<HTMLInputElement>(null),
    [cells, setCells] = useState(""),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  const current = useRef({
    latex,
    cells,
    onChange,
    onFocus,
    onEnter,
    onMove,
    onEmptyBackspace,
    code,
  });
  current.current = {
    latex,
    cells,
    onChange,
    onFocus,
    onEnter,
    onMove,
    onEmptyBackspace,
    code,
  };
  const ownLatex = useRef<string | null>(null),
    lastCode = useRef(code),
    pendingCursor = useRef<number | null>(null),
    chord = useRef({ down: new Set<string>(), bits: 0 });
  function edit(value: string) {
    try {
      const normalized = sixDotCells(value);
      setCells(normalized);
      setError("");
      let math: string;
      try {
        math = brailleToLatex(normalized, current.current.code);
      } catch (e) {
        setError(String(e instanceof Error ? e.message : e));
        math = `\\operatorname{BrailleInput}(${normalized})`;
      }
      ownLatex.current = math;
      current.current.onChange(math);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    }
  }
  function insert(value: string) {
    const el = input.current!;
    const at = el.selectionStart ?? el.value.length,
      end = el.selectionEnd ?? at;
    pendingCursor.current = at + value.length;
    edit(el.value.slice(0, at) + value + el.value.slice(end));
  }
  useLayoutEffect(() => {
    // Restore the cursor with the committed value before another input event
    // can select or replace text. A delayed frame would overwrite that selection.
    const at = pendingCursor.current;
    if (at === null || !input.current) return;
    pendingCursor.current = null;
    input.current.focus();
    input.current.setSelectionRange(at, at);
  });
  useEffect(() => {
    const codeChanged = lastCode.current !== code;
    lastCode.current = code;
    if (!codeChanged && ownLatex.current === latex) return;
    let alive = true;
    const raw = /^\\operatorname\{BrailleInput\}\((.*)\)$/s.exec(latex);
    if (raw) {
      setCells(raw[1]);
      setError("Check this Braille expression.");
      return;
    }
    setLoading(Boolean(latex));
    translateBraille(latex, code)
      .then((value) => {
        if (alive) {
          setCells(value);
          setError("");
          setLoading(false);
        }
      })
      .catch(() => {
        if (alive) {
          setLoading(false);
          setError("This expression could not be translated to Braille.");
        }
      });
    return () => {
      alive = false;
    };
  }, [latex, code]);
  useLayoutEffect(() => {
    const api = {
      focus() {
        input.current?.focus();
        return api;
      },
      blur() {
        input.current?.blur();
        return api;
      },
      el() {
        return input.current!;
      },
      latex(value?: string) {
        if (value === undefined) return current.current.latex;
        current.current.onChange(value);
        return api;
      },
      write(value: string) {
        void translateBraille(value, current.current.code)
          .then(insert)
          .catch(() =>
            setError("This key could not be translated to Braille."),
          );
        return api;
      },
      typedText(value: string) {
        const translated = value === "sqrt" ? "\\sqrt{}" : value;
        return api.write(translated);
      },
      keystroke(key: string) {
        const el = input.current!;
        let at = el.selectionStart ?? el.value.length;
        if (key === "Enter") {
          current.current.onEnter?.();
          return api;
        }
        if (key === "Backspace") {
          if (!el.value) current.current.onEmptyBackspace?.();
          else if (el.selectionStart === el.selectionEnd) {
            el.setSelectionRange(Math.max(0, at - 1), at);
            insert("");
          } else insert("");
        } else if (key === "Left" || key === "Right") {
          at = Math.max(
            0,
            Math.min(el.value.length, at + (key === "Left" ? -1 : 1)),
          );
          el.setSelectionRange(at, at);
        } else if (key === "Ctrl-A") el.select();
        else if (key === "Up" || key === "Down")
          current.current.onMove?.(key === "Up" ? -1 : 1);
        return api;
      },
      select() {
        input.current?.select();
        return api;
      },
      selection() {
        return {
          start: input.current?.selectionStart,
          end: input.current?.selectionEnd,
        };
      },
    };
    register?.(api as unknown as MathAPI);
    return () => register?.(null);
  }, []);
  return (
    <span className={`braille-field ${className}`}>
      <input
        ref={input}
        value={cells}
        aria-label={`${label} (${code} Braille)`}
        aria-invalid={Boolean(error)}
        aria-busy={loading}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        onFocus={onFocus}
        onChange={(e) => edit(e.target.value)}
        onKeyDown={(e) => {
          const key = e.key.toLowerCase(),
            dot = { f: 1, d: 2, s: 4, j: 8, k: 16, l: 32 }[key as "f"];
          if (sixKey && dot && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            chord.current.down.add(key);
            chord.current.bits |= dot;
            return;
          }
          if (e.key === "Enter") {
            e.preventDefault();
            onEnter?.();
          } else if (e.key === "Backspace" && !cells) {
            e.preventDefault();
            onEmptyBackspace?.();
          } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            onMove?.(e.key === "ArrowUp" ? -1 : 1);
          }
        }}
        onKeyUp={(e) => {
          const key = e.key.toLowerCase();
          if (!chord.current.down.has(key)) return;
          e.preventDefault();
          chord.current.down.delete(key);
          if (!chord.current.down.size && chord.current.bits) {
            insert(String.fromCharCode(0x2800 + chord.current.bits));
            chord.current.bits = 0;
          }
        }}
        onBlur={() => {
          chord.current = { down: new Set(), bits: 0 };
        }}
      />
      {error && (
        <span className="braille-error" role="status">
          {error}
        </span>
      )}
    </span>
  );
}
export function BrailleText({
  latex,
  code,
}: {
  latex: string;
  code: "Nemeth" | "UEB";
}) {
  const [text, setText] = useState("");
  useEffect(() => {
    let alive = true;
    translateBraille(latex, code)
      .then((s) => {
        if (alive) setText(s);
      })
      .catch(() => {
        if (alive) setText("");
      });
    return () => {
      alive = false;
    };
  }, [latex, code]);
  return <span className="braille-text">{text}</span>;
}
