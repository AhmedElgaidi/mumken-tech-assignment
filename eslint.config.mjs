import js from "@eslint/js";
import checkFile from "eslint-plugin-check-file";
import prettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";
/** Every layer a source file may name in its suffix: `<name>.<layer>.ts`. */
const LAYERS = [
  "controller",
  "service",
  "repository",
  "model",
  "module",
  "guard",
  "filter",
  "interceptor",
  "middleware",
  "pipe",
  "exception",
  "factory",
  "processor",
  "driver",
  "validator",
  "transform",
  "scheduler",
  "command",
  "util",
  "helper",
  "dto",
  "interface",
  "type",
  "enum",
  "constant",
  "token",
  "decorator",
];

const LAYER_SUFFIX_PATTERN = `*.@(${LAYERS.join("|")})`;

/** The yes/no prefixes a camelCase boolean name starts with. */
const BOOLEAN_NAME_PREFIXES = ["is", "has", "can", "should", "did", "will"];

/** Persistence and queue packages a controller may not import; services and repositories wrap them. */
const CONTROLLER_BANNED_PACKAGES = ["sequelize", "sequelize-typescript", "pg", "bullmq", "ioredis"];

const UTIL_PATTERN = {
  regex: "^(?!(node:|\\.))",
  message:
    "*.util.ts files are first-party only. A file that needs a third-party package is a *.helper.ts in helpers/.",
};

/** Flat config replaces `no-restricted-imports` per block, so each block restates the set it owes. */
function restrictedImports({ controller = false, util = false } = {}) {
  const patterns = [];
  if (util) {
    patterns.push(UTIL_PATTERN);
  }
  return {
    "no-restricted-imports": [
      "error",
      {
        patterns,
        ...(controller
          ? {
              paths: CONTROLLER_BANNED_PACKAGES.map((name) => ({
                name,
                message: "A controller only routes; persistence and the queue live in services and repositories.",
              })),
            }
          : {}),
      },
    ],
  };
}

const RESTRICTED_SYNTAX = [
  "error",
  { selector: "TSEnumDeclaration[const=true]", message: "No `const enum`; use a plain enum." },
  {
    selector: "CallExpression[callee.name='forwardRef']",
    message: "No forwardRef: it hides an import cycle. Break the cycle.",
  },
  {
    selector: "MemberExpression[object.name='Math'][property.name='random']",
    message: "No Math.random; use `crypto` for anything that matters.",
  },
];

export default tseslint.config(
  {
    ignores: ["dist/**", "coverage/**", "node_modules/**", "test/jest-*.config.js"],
  },
  { linterOptions: { reportUnusedDisableDirectives: "error" } },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    files: ["**/*.ts"],
    plugins: { "check-file": checkFile },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/explicit-member-accessibility": [
        "error",
        { accessibility: "explicit", overrides: { constructors: "explicit" } },
      ],
      "@typescript-eslint/member-ordering": ["error", { default: ["signature", "field", "constructor", "method"] }],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/naming-convention": [
        "error",
        { selector: "variable", modifiers: ["destructured"], format: null },
        {
          selector: "variable",
          modifiers: ["destructured"],
          types: ["boolean"],
          filter: { regex: "^[a-z]", match: true },
          format: null,
        },
        {
          selector: "variable",
          types: ["boolean"],
          filter: { regex: "^[a-z]", match: true },
          format: ["PascalCase"],
          prefix: BOOLEAN_NAME_PREFIXES,
          leadingUnderscore: "forbid",
          trailingUnderscore: "forbid",
        },
        {
          selector: "variable",
          format: ["camelCase", "UPPER_CASE", "PascalCase"],
          leadingUnderscore: "forbid",
          trailingUnderscore: "forbid",
        },
        { selector: "parameter", modifiers: ["destructured"], format: null },
        {
          selector: "parameter",
          modifiers: ["destructured"],
          types: ["boolean"],
          filter: { regex: "^_?[a-z]", match: true },
          format: null,
        },
        {
          selector: "parameter",
          types: ["boolean"],
          filter: { regex: "^_?[a-z]", match: true },
          format: ["PascalCase"],
          prefix: BOOLEAN_NAME_PREFIXES,
          leadingUnderscore: "allow",
          trailingUnderscore: "forbid",
        },
        {
          selector: "parameter",
          format: ["camelCase"],
          leadingUnderscore: "allow",
          trailingUnderscore: "forbid",
        },
        {
          selector: "function",
          format: ["camelCase", "PascalCase"],
          leadingUnderscore: "forbid",
          trailingUnderscore: "forbid",
        },
        { selector: ["class", "typeAlias", "enum"], format: ["PascalCase"] },
        {
          selector: "interface",
          format: ["PascalCase"],
          custom: { regex: "^I[A-Z]", match: false },
        },
        { selector: ["classMethod", "classProperty"], modifiers: ["requiresQuotes"], format: null },
        {
          selector: "classMethod",
          format: ["camelCase"],
          leadingUnderscore: "forbid",
          trailingUnderscore: "forbid",
        },
        {
          selector: "classProperty",
          format: ["camelCase", "UPPER_CASE"],
          leadingUnderscore: "forbid",
          trailingUnderscore: "forbid",
        },
        {
          selector: "typeParameter",
          format: ["PascalCase"],
          custom: { regex: "^T([A-Z][A-Za-z0-9]*)?$", match: true },
        },
      ],
      "no-param-reassign": ["error", { props: true }],
      "max-lines": ["error", { max: 400, skipBlankLines: true, skipComments: true }],
      "max-depth": ["error", 3],
      "no-restricted-syntax": RESTRICTED_SYNTAX,
      ...restrictedImports(),
      "no-console": "error",
      "check-file/filename-naming-convention": ["error", { "**/*.ts": "KEBAB_CASE" }, { ignoreMiddleExtensions: true }],
      "check-file/folder-naming-convention": ["error", { "src/**/": "KEBAB_CASE", "test/**/": "KEBAB_CASE" }],
    },
  },
  {
    files: ["src/**/*.ts"],
    ignores: ["src/main.ts", "**/*.spec.ts"],
    plugins: { "check-file": checkFile },
    rules: {
      "check-file/filename-naming-convention": [
        "error",
        { "**/*.ts": LAYER_SUFFIX_PATTERN },
        {
          errorMessage: "Every source file needs a layer suffix (*.service.ts, *.dto.ts, *.util.ts, …).",
        },
      ],
    },
  },
  {
    files: ["src/**/controllers/*.ts"],
    rules: restrictedImports({ controller: true }),
  },
  {
    files: ["src/**/*.util.ts", "test/**/*.util.ts"],
    rules: restrictedImports({ util: true }),
  },
  {
    files: ["src/**/*.ts", "test/**/*.ts"],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/switch-exhaustiveness-check": "error",
    },
  },
  {
    files: ["src/infrastructure/schema/**/*.js", ".sequelizerc"],
    languageOptions: {
      sourceType: "commonjs",
      globals: {
        require: "readonly",
        module: "writable",
        process: "readonly",
        __dirname: "readonly",
      },
    },
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
);
