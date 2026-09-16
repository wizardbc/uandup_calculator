import { createContext } from "react";
export type BrailleCode = "none" | "Nemeth" | "UEB";
export const BrailleContext = createContext<{
  code: BrailleCode;
  sixKey: boolean;
}>({ code: "none", sixKey: false });
