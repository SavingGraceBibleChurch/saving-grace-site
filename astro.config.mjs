import { defineConfig } from "astro/config";

// The live site's canonical host is www. Every URL keeps WordPress's trailing slash.
export default defineConfig({
  site: "https://www.savinggrace.org.au",
  trailingSlash: "always",
  output: "static",
  build: { format: "directory" },
  telemetry: false
});
