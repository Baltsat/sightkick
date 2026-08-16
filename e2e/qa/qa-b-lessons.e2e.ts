import { expect, test, type Page } from '@playwright/test';
import { launchApp, type Harness } from '../support';

test.setTimeout(180_000);

async function configureKeyboard(page: Page) {
  await page.evaluate(() => {
    localStorage.setItem(
      'settings.selectedDevice',
      JSON.stringify({
        id: 'keyboard',
        name: 'Keyboard',
        sourceId: 'keyboard',
      }),
    );
    localStorage.setItem(
      'settings.inputMappings',
      JSON.stringify({
        keyboard: {
          kick: ['keyboard:KeyK'],
          snare: ['keyboard:KeyJ'],
          hihat: ['keyboard:KeyH'],
        },
      }),
    );
    localStorage.setItem(
      'settings.controlMappings',
      JSON.stringify({
        keyboard: {
          confirm: ['keyboard:KeyC'],
          back: ['keyboard:KeyB'],
        },
      }),
    );
  });
  await page.reload();
}

async function waitForHome(page: Page) {
  await expect(page.getByRole('main', { name: 'Home content' })).toBeVisible({
    timeout: 60_000,
  });
}

test.describe('qa-b lesson escape paths', () => {
  // Deep journey checks: green on real hardware, timing-brittle on slow CI
  // runners across every OS. Run locally or scheduled with QA_DEEP=1; the
  // per-push gate keeps the stable specs.
  test.skip(
    process.platform !== 'darwin' || process.env.QA_DEEP !== '1',
    'deep journey suites run on macOS with QA_DEEP=1',
  );

  let harness: Harness | undefined;

  test.afterEach(async ({ browserName: _browserName }, testInfo) => {
    const page = harness ? await harness.app.firstWindow() : undefined;

    if (
      page &&
      !page.isClosed() &&
      testInfo.status !== testInfo.expectedStatus
    ) {
      await testInfo.attach('lesson-flow-failure', {
        body: await page.screenshot(),
        contentType: 'image/png',
      });
    }

    await harness?.app.close();
    harness = undefined;
  });

  test('a mapped keyboard can open the focused lesson and return to Journey', async () => {
    harness = await launchApp({ seedLibrary: false });

    const page = await harness.app.firstWindow();

    await waitForHome(page);
    await configureKeyboard(page);
    await waitForHome(page);
    await page.getByTestId('view-lessons').click();
    await expect(page.getByTestId('lessons-scroll-root')).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByTestId('lesson-item-01.01')).toBeVisible();

    await page.keyboard.press('KeyC');
    await expect(page.getByTestId('play-toggle')).toBeVisible({
      timeout: 60_000,
    });
    await page.getByTestId('back-button').click();
    await expect(page.getByTestId('lessons-scroll-root')).toBeVisible({
      timeout: 30_000,
    });
  });

  test('a mapped kick starts count-in and the visible transport control cancels it', async () => {
    harness = await launchApp({ seedLibrary: false });

    const page = await harness.app.firstWindow();

    await waitForHome(page);
    await configureKeyboard(page);
    await waitForHome(page);
    await page.getByTestId('view-lessons').click();
    await expect(page.getByTestId('lesson-item-01.01')).toBeVisible({
      timeout: 60_000,
    });
    await page.getByTestId('lesson-item-01.01').click();
    await expect(page.getByTestId('play-toggle')).toBeVisible({
      timeout: 60_000,
    });

    await page.waitForTimeout(1_000);
    await page.keyboard.press('KeyK');
    await expect(page.getByTestId('count-in')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('play-toggle')).toHaveAttribute(
      'aria-label',
      'Cancel count-in',
    );
    await page.getByTestId('play-toggle').click();
    await expect(page.getByTestId('count-in')).toHaveCount(0);
    await expect(page.getByTestId('play-toggle')).toHaveAttribute(
      'aria-label',
      'Play',
    );
  });

  test('a silence veil resumes from a mapped drum hit instead of trapping the lesson', async () => {
    harness = await launchApp({ seedLibrary: false });

    const page = await harness.app.firstWindow();

    await waitForHome(page);
    await configureKeyboard(page);
    await waitForHome(page);
    await page.getByTestId('view-lessons').click();
    await expect(page.getByTestId('lesson-item-01.01')).toBeVisible({
      timeout: 60_000,
    });
    await page.getByTestId('lesson-item-01.01').click();
    await expect(page.getByTestId('practice-readiness-cue')).toBeVisible({
      timeout: 60_000,
    });

    await page.waitForTimeout(1_000);
    await page.keyboard.press('KeyK');
    await expect(page.getByTestId('count-in')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('inactivity-pause-veil')).toBeVisible({
      timeout: 20_000,
    });

    await page.keyboard.press('KeyJ');
    await expect(page.getByTestId('inactivity-pause-veil')).toHaveCount(0);
    await expect(page.getByTestId('count-in')).toBeVisible({ timeout: 10_000 });
  });
});
