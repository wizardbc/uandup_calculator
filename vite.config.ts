import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve, dirname } from "node:path";

export default defineConfig({
  base: "./",
  plugins: [
    {
      name: "desquill-text-imports",
      enforce: "pre",
      resolveId(id, importer) {
        if (id === "virtual:desquill")
          return resolve("third_party/desquill/mq-public-api.ts");
        if (id.startsWith("text!") && importer)
          return resolve(dirname(importer), id.slice(5)) + "?raw";
      },
    },
    react(),
  ],
  build: { target: ["chrome90", "firefox90", "safari15"], sourcemap: true },
  server: { port: 5173, strictPort: true },
});
