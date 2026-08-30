import { chromium } from "playwright";
const [src, out] = process.argv.slice(2);
const b = await chromium.launch({executablePath: process.env.HOME+"/.cache/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell"});
const pg = await b.newPage({viewport:{width:512,height:512}});
await pg.goto("file://"+src); await pg.waitForTimeout(2500);
await pg.screenshot({path: out}); await b.close();
