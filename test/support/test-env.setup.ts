/** Test runs use `NODE_ENV=test` (silent logs); DATABASE_URL and REDIS_URL come from the global setup, tuning values from `TEST_APP_SETTINGS`. */
Object.assign(process.env, {
  NODE_ENV: "test",
});
