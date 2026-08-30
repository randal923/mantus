import { chromium } from "playwright";
const [src, outDir] = process.argv.slice(2);
const b = await chromium.launch({executablePath: process.env.HOME+"/.cache/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell"});
for (const size of [16, 32, 48, 64]) {
  const pg = await b.newPage({viewport:{width:size,height:size}});
  await pg.goto("file://"+src);
  await pg.addStyleTag({content:`.icon{transform:scale(${size/512});transform-origin:top left}`});
  await pg.waitForTimeout(2000);
  await pg.screenshot({path: `${outDir}/fav-${size}.png`});
  await pg.close();
}
await b.close();
