import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/plugins/index.ts", "src/adapters/index.ts"],
  format: ["cjs", "esm"],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  minify: false,
  treeshake: true,
});
