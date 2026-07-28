import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    direct: "src/direct.ts",
    bebop: "src/bebop.ts",
    relay: "src/relay.ts",
    deribit: "src/deribit.ts",
  },
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
  outDir: "dist",
  target: "es2022",
  skipNodeModulesBundle: true,
  banner: {
    js: 'import { createRequire } from "module"; const require = createRequire(import.meta.url);',
  },
});
