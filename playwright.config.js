import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './test/e2e',
  timeout: 15_000,
  retries: 0,
  reporter: [['list']],
  // http.server's default listen backlog is 5; 抓大鹅 fetches several modules at once,
  // and with three browsers in parallel the overflow comes back as connection resets.
  webServer: [{ command: `python3 -c "import http.server as h; h.ThreadingHTTPServer.request_queue_size = 128; h.test(HandlerClass=h.SimpleHTTPRequestHandler, ServerClass=h.ThreadingHTTPServer, port=4173)"`, port: 4173, reuseExistingServer: true }, {
    // 联机测试连的房间服务；不设 ALLOWED_ORIGINS，接受本机页面的任意端口。
    command: 'node server/index.js', port: 2567, reuseExistingServer: true, env: { PORT: '2567', ALLOWED_ORIGINS: '', BOT_DELAY_MS: '150' }
  }],
  use: { baseURL: 'http://127.0.0.1:4173', browserName: 'chromium', channel: 'chrome', headless: true },
  projects: [
    { name: 'mobile', use: { ...devices['iPhone 13'] } },
    { name: 'tablet', use: { ...devices['iPad (gen 7)'] } },
    { name: 'desktop', use: { viewport: { width: 1280, height: 900 } } }
  ]
});
