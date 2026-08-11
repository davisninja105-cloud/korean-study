import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Phase 35: sw-template.js is a service-worker source TEMPLATE containing
    // literal __TOKEN__ substitution placeholders (replaced by
    // scripts/gen-sw.mjs before the file is ever run) — it is not meant to
    // lint-clean as standalone JS. public/sw.js is the build-generated
    // output of that template (gitignored, regenerated every build).
    "scripts/sw-template.js",
    "public/sw.js",
  ]),
]);

export default eslintConfig;
