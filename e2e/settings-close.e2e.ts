import { expect, test, type Page } from '@playwright/test';
import { launchApp, type Harness } from './support';

test.setTimeout(180_000);

async function waitForAppReady(currentPage: Page) {
  const libraryHeading = currentPage.getByRole('heading', {
    name: 'Your drum library',
  });

  if (!(await libraryHeading.isVisible())) {
    await expect(
      currentPage.getByRole('main', { name: 'Home content' }),
    ).toBeVisible({ timeout: 60_000 });
    await currentPage.getByTestId('view-songs').click();
  }

  await expect(libraryHeading).toBeVisible({ timeout: 60_000 });
}

// Regression guard for the reported freeze: a stale modal wrapper in the
// DOM must not block the settings popover from closing on an outside
// click, and the app must keep responding. Outside-click is the guarded
// gesture — Escape handling differs per platform and is not asserted.
test('settings popover closes and the app keeps responding', async () => {
  let harness: Harness | undefined;

  try {
    harness = await launchApp({ seedLibrary: true });

    const page = await harness.app.firstWindow();

    await waitForAppReady(page);

    await page.getByTestId('settings-trigger').click();
    await expect(page.getByTestId('rescan-folder')).toBeVisible();

    await page.evaluate(() => {
      const staleModal = document.createElement('div');

      staleModal.className = 'ant-modal-wrap';
      staleModal.style.pointerEvents = 'none';
      staleModal.setAttribute('aria-hidden', 'true');
      document.body.append(staleModal);
    });

    // The popover anchors to the rail's bottom-left, so the top-right
    // corner of the window is outside it on every platform geometry.
    // Outside-click is the gesture that froze; the stale modal above
    // must not block it.
    const topRight = await page.evaluate(() => ({
      x: window.innerWidth - 24,
      y: 80,
    }));

    await page.mouse.click(topRight.x, topRight.y);
    await expect(page.getByTestId('rescan-folder')).not.toBeVisible({
      timeout: 5_000,
    });

    await page.getByTestId('settings-trigger').click();
    await expect(page.getByTestId('rescan-folder')).toBeVisible();
    await page.mouse.click(topRight.x, topRight.y);
    await expect(page.getByTestId('rescan-folder')).not.toBeVisible({
      timeout: 5_000,
    });

    await page.getByTestId('song-search').fill('a');
    await expect(page.getByTestId('song-search')).toHaveValue('a');
  } finally {
    await harness?.app.close();
  }
});
