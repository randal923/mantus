import { chromium } from "playwright";
import fs from "node:fs";
const dir = process.argv[2];
const b = await chromium.launch({executablePath: process.env.HOME+"/.cache/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell"});
const pg = await b.newPage();
for (const size of [16, 32, 48, 64]) {
  const b64 = fs.readFileSync(`${dir}/fav-${size}.png`).toString("base64");
  const dataUrl = await pg.evaluate(async ({ b64, size }) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = size; canvas.height = size;
    canvas.getContext("2d").drawImage(img, 0, 0);
    return canvas.toDataURL("image/png");
  }, { b64, size });
  fs.writeFileSync(`${dir}/fav-${size}-rgba.png`, Buffer.from(dataUrl.split(",")[1], "base64"));
}
await b.close();
