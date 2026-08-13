import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const baseUrl = 'http://localhost:6007';
const output = new URL('./', import.meta.url);
const stories = {
  armed: 'home-cockpit-evidence-cards--kit-launcher-armed',
  empty: 'home-cockpit-evidence-cards--p-1-evidence-cards',
};

await mkdir(output, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath:
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
});

async function capture({ id, viewport, filename, strike }) {
  const page = await browser.newPage({ viewport });

  await page.goto(`${baseUrl}/iframe.html?id=${id}&viewMode=story`);
  await page.getByTestId('home-cockpit').waitFor();

  if (strike) {
    await page.getByTestId(`kit-hotspot-${strike}`).click();
    await page.waitForTimeout(8);
  }

  await page.screenshot({ path: new URL(filename, output).pathname });
  await page.close();
}

await capture({
  id: stories.armed,
  viewport: { width: 1225, height: 768 },
  filename: '01-labelled-kit-1225x768.png',
});
await capture({
  id: stories.armed,
  viewport: { width: 1024, height: 700 },
  filename: '02-labelled-kit-1024x700.png',
});
await capture({
  id: stories.empty,
  viewport: { width: 1225, height: 768 },
  filename: '03-empty-top-tom.png',
});
await capture({
  id: stories.armed,
  viewport: { width: 1225, height: 768 },
  filename: '04-snare-struck-flare.png',
  strike: 'snare',
});

await browser.close();
