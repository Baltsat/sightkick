import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from '@playwright/test';

const outputDir = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.RESONANCE_PROOF_PORT ?? 4178);
const root = path.resolve(outputDir, '../../..');
const server = spawn(
  process.execPath,
  [
    path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'),
    '--host',
    '127.0.0.1',
    '--port',
    String(port),
    '--strictPort',
  ],
  { cwd: outputDir, stdio: 'ignore' },
);

function waitForServer() {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const timer = setInterval(async () => {
      try {
        const response = await fetch(
          `http://127.0.0.1:${port}/resonance-runway-harness.html`,
        );

        if (response.ok) {
          clearInterval(timer);
          resolve();
        }
      } catch (error) {
        void error;
      }

      if (Date.now() - startedAt > 30_000) {
        clearInterval(timer);
        reject(new Error('Resonance Runway proof server did not start'));
      }
    }, 100);
  });
}

async function capture(page, state, name, viewport) {
  await page.setViewportSize(viewport);
  await page.goto(
    `http://127.0.0.1:${port}/resonance-runway-harness.html?state=${state}`,
  );
  await page.getByTestId('loop-escape-runway').waitFor();
  await page.screenshot({ path: path.join(outputDir, name) });

  return page.evaluate(() => ({
    viewport: { width: window.innerWidth, height: window.innerHeight },
    scroll: {
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
    },
    phase: document
      .querySelector('[data-testid="loop-escape-runway"]')
      ?.getAttribute('data-phase'),
    retained: document
      .querySelector('[data-testid="loop-escape-runway"]')
      ?.getAttribute('data-retained-quality'),
  }));
}

async function run() {
  await waitForServer();

  const app = await electron.launch({
    args: [
      path.join(outputDir, 'resonance-runway-electron.mjs'),
      `http://127.0.0.1:${port}/resonance-runway-harness.html?state=anchor`,
    ],
    env: { ...process.env, START_MINIMIZED: '1' },
  });
  const page = await app.firstWindow();

  try {
    const proof = {
      retained: await capture(
        page,
        'retained',
        '01-near-clean-retained-quality.png',
        {
          width: 1225,
          height: 768,
        },
      ),
      anchor: await capture(page, 'anchor', '02-first-clean-anchor.png', {
        width: 1225,
        height: 768,
      }),
      release: await capture(
        page,
        'release',
        '03-loop-release-tempo-rise.png',
        {
          width: 1225,
          height: 768,
        },
      ),
      viewport: await capture(
        page,
        'anchor',
        '04-no-outer-scroll-1024x700.png',
        {
          width: 1024,
          height: 700,
        },
      ),
    };

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(
      `http://127.0.0.1:${port}/resonance-runway-harness.html?state=anchor`,
    );
    await page.getByTestId('loop-escape-runway').waitFor();
    proof.reducedMotion = await page.evaluate(() => {
      const ribbon = document.querySelector('.drumroll-loop-escape__energy');

      return {
        transitionDuration: ribbon
          ? getComputedStyle(ribbon).transitionDuration
          : null,
      };
    });

    for (const [name, metrics] of Object.entries(proof)) {
      if (
        name !== 'reducedMotion' &&
        (metrics.scroll.width > metrics.viewport.width ||
          metrics.scroll.height > metrics.viewport.height)
      ) {
        throw new Error(`${name} proof has outer scroll`);
      }
    }

    if (proof.reducedMotion.transitionDuration !== '0s') {
      throw new Error('Reduced-motion ribbon transition is still active');
    }

    fs.writeFileSync(
      path.join(outputDir, 'proof.json'),
      `${JSON.stringify(proof, null, 2)}\n`,
    );
    process.stdout.write(`${JSON.stringify(proof, null, 2)}\n`);
  } finally {
    await app.close();
  }
}

run()
  .catch((error) => {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exitCode = 1;
  })
  .finally(() => server.kill());
