import { _electron as electron } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const output_dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(output_dir, '../../..');
const main_entry = path.join(root, 'out', 'main', 'index.js');
const source_config = path.join(root, '.userdata', 'final-qa', 'config.json');
const viewport = { width: 1365, height: 820 };

function field_state(page) {
  return page.evaluate(() => {
    const shell = document.querySelector('.arena-shell');
    const field = shell ? getComputedStyle(shell, '::before') : null;

    return {
      animation_name: field?.animationName ?? null,
      data_view: shell?.getAttribute('data-view') ?? null,
      has_wave_destination: Boolean(
        document.querySelector('[data-testid="view-wave"]'),
      ),
      is_transitioning:
        shell?.classList.contains('arena-shell--transitioning') ?? false,
      reduced_motion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      scroll: {
        height: document.documentElement.scrollHeight,
        width: document.documentElement.scrollWidth,
      },
      viewport: {
        height: window.innerHeight,
        width: window.innerWidth,
      },
    };
  });
}

async function run() {
  if (!fs.existsSync(main_entry)) {
    throw new Error(`build output missing at ${main_entry}`);
  }

  if (!fs.existsSync(source_config)) {
    throw new Error(`visual fixture config missing at ${source_config}`);
  }

  const user_data_dir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'drumroll-wave-field-'),
  );
  const proof = {};
  let app;

  fs.copyFileSync(source_config, path.join(user_data_dir, 'config.json'));

  try {
    app = await electron.launch({
      args: [main_entry, '--mute-audio'],
      env: {
        ...process.env,
        NODE_ENV: 'production',
        SK_USER_DATA_DIR: user_data_dir,
        START_MINIMIZED: '1',
      },
    });

    const page = await app.firstWindow();

    await page.setViewportSize(viewport);
    await page.getByTestId('home-cockpit').waitFor({ timeout: 60_000 });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.screenshot({
      animations: 'allow',
      path: path.join(output_dir, '00-home-kit-field.png'),
    });
    proof.home = await field_state(page);
    await page.getByTestId('view-songs').click();
    await page.getByTestId('library-toolbar').waitFor({ timeout: 30_000 });
    await page.waitForTimeout(950);
    await page.screenshot({
      animations: 'allow',
      path: path.join(output_dir, '01-field-at-rest.png'),
    });
    proof.rest = await field_state(page);

    await page.getByTestId('view-lessons').click();
    await page
      .locator('.arena-shell--transitioning')
      .waitFor({ timeout: 2_000 });
    await page.screenshot({
      animations: 'allow',
      path: path.join(output_dir, '02-field-mid-transition.png'),
    });
    proof.transition = await field_state(page);

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.getByTestId('view-songs').click();
    await page.getByTestId('library-toolbar').waitFor({ timeout: 30_000 });
    await page.waitForTimeout(950);
    await page.screenshot({
      animations: 'allow',
      path: path.join(output_dir, '03-field-reduced-motion.png'),
    });
    proof.reduced_motion = await field_state(page);

    if (
      proof.rest.has_wave_destination ||
      proof.transition.has_wave_destination
    ) {
      throw new Error('My Wave still appears as a destination in the rail');
    }

    if (!proof.transition.is_transitioning) {
      throw new Error('route change did not mark the field transition');
    }

    if (
      !proof.reduced_motion.reduced_motion ||
      proof.reduced_motion.animation_name !== 'none'
    ) {
      throw new Error('reduced motion did not disable the field animation');
    }

    for (const state of Object.values(proof)) {
      if (
        state.scroll.width > state.viewport.width ||
        state.scroll.height > state.viewport.height
      ) {
        throw new Error(
          `field capture has outer scroll: ${JSON.stringify(state)}`,
        );
      }
    }
  } finally {
    fs.writeFileSync(
      path.join(output_dir, 'proof.json'),
      `${JSON.stringify(proof, null, 2)}\n`,
    );
    await app?.close();
    fs.rmSync(user_data_dir, { force: true, recursive: true });
  }
}

run().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exitCode = 1;
});
