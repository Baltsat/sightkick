import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

// Visual proof for the Journey/LessonsView, ScoreSummary, and Profile lane
// (design-acceptance-notes.md goals 1-4): captured against local Storybook
// (see LessonsView.stories.tsx, ScoreSummary.stories.tsx,
// ProfileView.stories.tsx) rather than the built app, so it does not touch
// the shared out/ build other lanes may depend on.
const baseUrl = 'http://localhost:6100';
const output = new URL('./', import.meta.url);
const wide = { width: 1225, height: 768 };
const compact = { width: 1024, height: 700 };

await mkdir(output, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath:
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
});

async function shoot(id, filename, viewport, afterLoad) {
  const page = await browser.newPage({ viewport });

  // "load" never fires against the Storybook/Vite dev iframe (an open HMR
  // websocket keeps the page from settling); domcontentloaded plus an
  // explicit settle wait is what the rest of this repo's capture scripts
  // rely on too.
  await page.goto(`${baseUrl}/iframe.html?id=${id}&viewMode=story`, {
    waitUntil: 'domcontentloaded',
    timeout: 20000,
  });
  await page.waitForTimeout(600);

  if (afterLoad) {
    await afterLoad(page);
  }

  await page.waitForTimeout(200);
  await page.screenshot({ path: new URL(filename, output).pathname });
  await page.close();
}

// 1. Journey sits on the shared field, no separate studio backdrop.
await shoot(
  'journey-lessons-view--rehearsal-route',
  '01-journey-1225x768.png',
  wide,
);
await shoot(
  'journey-lessons-view--rehearsal-route',
  '02-journey-1024x700.png',
  compact,
);

// 2. Result screen: worst-case footer stress test, continuation visible
//    without scrolling, on the shared field gradient.
await shoot(
  'song-view-score-summary--worst-case-footer',
  '03-result-worst-case-1024x700.png',
  compact,
);
await shoot(
  'song-view-score-summary--musical-receipt',
  '04-result-musical-receipt-1225x768.png',
  wide,
);

// 3. Profile: full-screen, one time scale, one control. Capture all three
//    scales plus the compact viewport.
await shoot(
  'insights-profile-view--evidence-backed-route',
  '05-profile-today-1225x768.png',
  wide,
);
await shoot(
  'insights-profile-view--evidence-backed-route',
  '06-profile-30d-1225x768.png',
  wide,
  async (page) => {
    await page.getByTestId('profile-scale-30d').click();
    await page.waitForTimeout(150);
  },
);
await shoot(
  'insights-profile-view--evidence-backed-route',
  '07-profile-history-1225x768.png',
  wide,
  async (page) => {
    await page.getByTestId('profile-scale-history').click();
    await page.waitForTimeout(150);
  },
);
await shoot(
  'insights-profile-view--evidence-backed-route',
  '08-profile-today-1024x700.png',
  compact,
);

await browser.close();
