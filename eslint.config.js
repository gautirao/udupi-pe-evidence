import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Issue #1992 Slice 1B — import-boundary guardrails (warn-only). Discovered
// dynamically so new feature folders are covered without editing this file.
const featuresDir = path.join(__dirname, "src/features");
const featureNames = fs.existsSync(featuresDir)
  ? fs
      .readdirSync(featuresDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  : [];

// Per-feature config: features/<X> must not import pages/* or a sibling
// features/<Y>. Both constraints live in ONE rule entry per zone because
// flat-config rule values from later matching blocks replace (not merge
// with) earlier ones for the same rule key. The sibling-feature pattern is
// only added once a second feature exists — an empty `group` array fails
// the rule's own JSON schema (minItems: 1).
const featureBoundaryConfigs = featureNames.map((feature) => {
  const siblingGroup = featureNames
    .filter((other) => other !== feature)
    .map((other) => `@/features/${other}/*`);

  const patterns = [
    {
      group: ["@/pages/*"],
      message: "features/* must not import from pages/*; invert the dependency via props/context instead.",
    },
  ];
  if (siblingGroup.length > 0) {
    patterns.push({
      group: siblingGroup,
      message: "Cross-feature imports are discouraged; sibling features/* must not import each other directly.",
    });
  }

  return {
    files: [`src/features/${feature}/**/*.{ts,tsx}`],
    rules: {
      "@typescript-eslint/no-restricted-imports": ["warn", { patterns }],
    },
  };
});

export default tseslint.config(
  { ignores: ["dist", ".claude/**", "docs/design/**", "mockup/**"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "warn",
    },
  },
  ...featureBoundaryConfigs,
  // Forward guard: src/shared/ doesn't exist yet, but when it does, it must
  // not depend on features/*.
  {
    files: ["src/shared/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "warn",
        {
          patterns: [
            {
              group: ["@/features/*"],
              message: "shared/* must not import from features/*.",
            },
          ],
        },
      ],
    },
  },
);
