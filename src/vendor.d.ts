declare module "virtual:desquill" {
  export interface MathFieldAPI {
    latex(): string;
    latex(value: string): MathFieldAPI;
    write(value: string): MathFieldAPI;
    cmd(value: string): MathFieldAPI;
    typedText(value: string): MathFieldAPI;
    keystroke(value: string): MathFieldAPI;
    focus(): MathFieldAPI;
    blur(): MathFieldAPI;
    select(): MathFieldAPI;
    moveToLeftEnd(): MathFieldAPI;
    moveToRightEnd(): MathFieldAPI;
    mathspeak(): string;
    subscribeToChanges(callback: () => void): () => void;
    setAriaLabel(label: string): MathFieldAPI;
    el(): HTMLElement;
    selection(): {
      startIndex: number;
      endIndex: number;
      anchorIndex: number;
      headIndex: number;
    };
    config(value: Record<string, unknown>): void;
  }
  export function MathField(
    element: HTMLElement,
    config: Record<string, unknown>,
  ): MathFieldAPI;
  export function StaticMath(
    element: HTMLElement,
    config: Record<string, unknown>,
  ): MathFieldAPI;
  export function bundledLocalize(
    key: string,
    variables: unknown,
    lang: string,
  ): string;
}
