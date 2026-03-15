import { defineConfig } from "@hey-api/openapi-ts"

export default defineConfig([
  {
    input: "src/specs/patentsview.json",
    output: { path: "src/generated/patentsview" },
    plugins: [
      "@hey-api/typescript",
      {
        name: "zod",
        definitions: true,
        responses: true,
        metadata: true,
      },
    ],
  },
  {
    input: "src/specs/uspto-odp.yaml",
    output: { path: "src/generated/odp" },
    plugins: [
      "@hey-api/typescript",
      {
        name: "zod",
        definitions: true,
        responses: true,
        metadata: true,
      },
    ],
  },
])
