/** Integration tests: real PostgreSQL and Redis started by Testcontainers (Docker must be running). */
module.exports = {
  rootDir: "..",
  testEnvironment: "node",
  testMatch: ["<rootDir>/test/integration/**/*.int-spec.ts"],
  transform: { "^.+\\.ts$": ["ts-jest", { tsconfig: "<rootDir>/tsconfig.json" }] },
  moduleFileExtensions: ["ts", "js", "json"],
  globalSetup: "<rootDir>/test/support/global-setup.ts",
  globalTeardown: "<rootDir>/test/support/global-teardown.ts",
  setupFiles: ["<rootDir>/test/support/test-env.setup.ts"],
  testTimeout: 60000,
};
