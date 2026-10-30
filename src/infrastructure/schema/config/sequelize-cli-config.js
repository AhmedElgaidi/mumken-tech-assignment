"use strict";

/**
 * Sequelize CLI connection config. Every environment reads its connection string from
 * `DATABASE_URL`, so the same file serves a developer machine, the test containers and the
 * runtime image. `sequelize-cli` fails with a clear error when the variable is unset.
 */
module.exports = {
  development: { use_env_variable: "DATABASE_URL", dialect: "postgres" },
  test: { use_env_variable: "DATABASE_URL", dialect: "postgres" },
  production: { use_env_variable: "DATABASE_URL", dialect: "postgres" },
};
