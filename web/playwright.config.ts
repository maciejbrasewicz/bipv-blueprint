import { defineConfig } from "@playwright/test";
export default defineConfig({
 testDir:"./e2e",timeout:90000,retries:0,workers:1,
 use:{baseURL:process.env.BASE_URL??"http://127.0.0.1:8000",viewport:{width:1440,height:960},screenshot:"only-on-failure",trace:"retain-on-failure",launchOptions:{args:["--use-angle=swiftshader","--enable-unsafe-swiftshader"]}},
 webServer:process.env.BASE_URL?undefined:{command:".venv/bin/uvicorn server.app:app --host 127.0.0.1 --port 8000",cwd:"..",url:"http://127.0.0.1:8000/api/health",reuseExistingServer:!process.env.CI,timeout:30000}
});
