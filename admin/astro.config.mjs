// The admin: a separate static build published to GitHub Pages (npm run admin:build).
// It is never part of the public site. Locally: npm run admin:dev → http://127.0.0.1:4330/saving-grace-site/
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://samuelsaad.github.io",
  base: "/saving-grace-site",
  outDir: "./dist",
  trailingSlash: "ignore",
  devToolbar: { enabled: false },
  build: { inlineStylesheets: "never" },
  server: { host: "127.0.0.1", port: 4330 },
  vite: { server: { fs: { allow: [".."] } } },
});
