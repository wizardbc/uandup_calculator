import { useEffect, useRef, useState } from "react";
import { MathField, type MathAPI } from "./MathField";
export function ConstantField({
  value,
  label,
  onCommit,
}: {
  value: string;
  label: string;
  onCommit: (latex: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const api = useRef<MathAPI | null>(null);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setDraft(value);
  }, [value]);
  return (
    <span
      className="constant-field"
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) {
          focused.current = false;
          onCommit(api.current?.latex() ?? draft);
        }
      }}
    >
      <MathField
        latex={draft}
        label={label}
        onChange={setDraft}
        onFocus={() => {
          focused.current = true;
        }}
        onEnter={() => {
          api.current?.blur();
        }}
        register={(field) => {
          api.current = field;
        }}
      />
    </span>
  );
}
