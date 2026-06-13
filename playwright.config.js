const { defineConfig } = require("@playwright/test");

const useSystemChrome = process.env.PLAYWRIGHT_USE_SYSTEM_CHROME === "1";

module.exports = defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60 * 1000,
  expect: {
    timeout: 10 * 1000
  },
  reporter: process.env.CI ? "github" : "list",
  use: {
    channel: useSystemChrome ? "chrome" : undefined,
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure"
  }
});
