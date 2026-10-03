import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./test",
  fullyParallel: false,
  workers: 1,
  timeout: 20_000,
  expect: { timeout: 5000 },
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:43180", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } } },
    { name: "mobile", use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } } },
  ],
  webServer: [
    ...(process.env.MONGODB_TEST_URI ? [{
      command: "npm --prefix ../backend run test:serve",
      url: "http://127.0.0.1:43181/health",
      reuseExistingServer: false,
      env: { MONGODB_TEST_URI: process.env.MONGODB_TEST_URI },
    }] : []),
    {
      command: process.env.WCL_TEST_PRODUCTION ? "node test/serve-production.mjs" : "npm run dev -- --hostname 127.0.0.1 --port 43180",
      url: "http://127.0.0.1:43180",
      reuseExistingServer: true,
      env: { BACKEND_URL: "http://127.0.0.1:43181", NEXT_TELEMETRY_DISABLED: "1", HOSTNAME: "127.0.0.1", PORT: "43180" },
    },
  ],
});
