/** E2E tests: the HTTP app and the worker in one process, against Testcontainers. */
module.exports = {
  rootDir: "..",
  testEnvironment: "node",
  testMatch: ["<rootDir>/test/e2e/**/*.e2e-spec.ts"],
  transform: { "^.+\\.ts$": ["ts-jest", { tsconfig: "<rootDir>/tsconfig.json" }] },
  moduleFileExtensions: ["ts", "js", "json"],
  globalSetup: "<rootDir>/test/support/global-setup.ts",
  globalTeardown: "<rootDir>/test/support/global-teardown.ts",
  setupFiles: ["<rootDir>/test/support/test-env.setup.ts"],
  testTimeout: 60000,
};
