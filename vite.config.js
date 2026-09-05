import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import vueDevTools from "vite-plugin-vue-devtools";

export default defineConfig({
  // Relative asset URLs keep the production bundle portable: GitHub Pages can
  // host it below /Math_War/, while a local static server can open dist/ from
  // any parent path without returning its HTML fallback for missing assets.
  base: "./",
  plugins: [vue(), vueDevTools()],
  server: {
    host: "127.0.0.1",
  },
  preview: {
    host: "127.0.0.1",
  },
  build: {
    target: "es2020",
  },
});
