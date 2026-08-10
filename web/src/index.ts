import '@fontsource-variable/instrument-sans';
import { installWebPlatform } from '../../src/platform/web';
import coachPanel from '../../docs/design-qa/daybreak-arena/implementation-coach.png';
import flowPractice from './assets/flow-practice.jpg';
import homeCockpit from './assets/home-cockpit.jpg';
import journeyMap from './assets/journey-map.jpg';
import './web.css';

const root = document.getElementById('root');
const publicReleaseHref =
  'https://github.com/Baltsat/sightkick/releases/download/v1.2.0-kb.5/Drumroll-1.2.0-kb.5-arm64.dmg';
const publicChecksumHref =
  'https://github.com/Baltsat/sightkick/releases/download/v1.2.0-kb.5/SHA256SUMS.txt';

if (!root) {
  throw new Error('Missing app root.');
}

async function startApp(): Promise<void> {
  const appUrl = new URL(location.href);

  appUrl.searchParams.set('app', '1');
  history.replaceState({}, '', appUrl);
  installWebPlatform();
  document.documentElement.dataset.platform = 'web';
  root.replaceChildren();
  localStorage.setItem('drumroll.web.welcome-seen', 'true');
  await import('../../src/renderer/index');
}

function showLanding(): void {
  root.innerHTML = `
    <main class="web-landing">
      <header class="web-site-header">
        <a class="web-wordmark" href="#top" aria-label="Drumroll home">Drumroll<span>Daybreak Arena</span></a>
        <button class="web-nav-toggle" type="button" aria-controls="web-site-nav" aria-expanded="false">Menu</button>
        <nav id="web-site-nav" class="web-site-nav" aria-label="Marketing navigation">
          <a href="#practice">Practice</a>
          <a href="#journey">Journey</a>
          <a href="#coach">Coach</a>
          <button type="button" class="web-nav-app" data-testid="start-drumroll">Open Drumroll</button>
        </nav>
      </header>

      <section class="web-hero" id="top" aria-labelledby="web-hero-title">
        <div class="web-hero-copy">
          <p class="web-kicker">Practice that listens back.</p>
          <h1 id="web-hero-title">Sit down.<br />Hit the cue.<br /><em>Keep playing.</em></h1>
          <p class="web-lede">Drumroll is a hands-free drum-learning game for an electronic kit. It holds the session together while your playing shows what comes next.</p>
          <div class="web-actions">
            <a class="web-actions__download" href="${publicReleaseHref}">Download for Apple Silicon</a>
            <button class="web-actions__browser" type="button" data-testid="start-drumroll-primary">Open browser lessons</button>
            <a href="#practice">See the practice loop</a>
          </div>
          <p class="web-fineprint">The browser app keeps lesson progress locally and supports Web MIDI. Local audio and chart creation remain in the signed desktop app.</p>
        </div>
        <figure class="web-media-frame web-hero-capture">
          <img src="${homeCockpit}" alt="The current Drumroll home cockpit with a drum kit, song context, kit-lane accuracy, and a play action." />
          <figcaption>Current desktop cockpit. The kit is the controller.</figcaption>
        </figure>
      </section>

      <section class="web-intro-band" aria-labelledby="web-promise-title">
        <p class="web-section-index">The promise</p>
        <div>
          <h2 id="web-promise-title">Practice lives in the music, not in the menu.</h2>
          <p>Start with a clear goal. Let Flow notation keep the next notes in view. In Practice, Drumroll can return to a safe checkpoint after a material pattern of misses; in Perform, it records one uninterrupted pass.</p>
        </div>
      </section>

      <section class="web-practice-section" id="practice" aria-labelledby="web-practice-title">
        <div class="web-section-heading">
          <p class="web-section-index">The practice loop</p>
          <h2 id="web-practice-title">Make the next bar legible.</h2>
          <p>Flow keeps the playhead fixed while the chart moves. Practice controls let you choose speed, notation, loops, checkpoint recovery, and lives without losing the musical thread.</p>
        </div>
        <figure class="web-media-frame web-practice-capture">
          <img src="${flowPractice}" alt="Drumroll Flow notation in a live Practice session with colored drum notes and a fixed playhead." />
          <figcaption>Current Flow notation in a Drumroll Practice session.</figcaption>
        </figure>
        <div class="web-sequence" aria-label="Drumroll practice sequence">
          <article><span>01</span><h3>Choose a reachable challenge.</h3><p>The next-practice selector balances prerequisites, recent mastery, kit-lane weakness, speed, spacing, and variety.</p></article>
          <article><span>02</span><h3>Stay in the phrase.</h3><p>When a material trouble window is resolved, Practice can recover to the latest safe musical checkpoint and lower the pace.</p></article>
          <article><span>03</span><h3>Return with evidence.</h3><p>A successful recovery releases the player back into the original path in bounded speed steps.</p></article>
        </div>
      </section>

      <section class="web-journey-section" id="journey" aria-labelledby="web-journey-title">
        <div class="web-journey-copy">
          <p class="web-section-index">The method</p>
          <h2 id="web-journey-title">A route through 170 playable exercises.</h2>
          <p>Fundamentals, rudiments, coordination, grooves, fills, and musical applications are arranged as a Journey. Each lesson carries its real title, prerequisite state, skill focus, tempo, and mastery rule.</p>
          <button type="button" class="web-inline-action" data-testid="start-drumroll-journey">Take the next lesson in browser</button>
        </div>
        <figure class="web-media-frame web-journey-capture">
          <img src="${journeyMap}" alt="The current Drumroll Journey showing the Foundations season and Lesson 01.01 as the next exercise." />
          <figcaption>Current Journey view with the Foundations season.</figcaption>
        </figure>
      </section>

      <section class="web-coach-section" id="coach" aria-labelledby="web-coach-title">
        <figure class="web-media-frame web-coach-capture">
          <img src="${coachPanel}" alt="Drumroll's practice coach explaining a saved run and the evidence it has available." />
          <figcaption>Coach reports what a saved run actually contains.</figcaption>
        </figure>
        <div class="web-coach-copy">
          <p class="web-section-index">The evidence</p>
          <h2 id="web-coach-title">Advice is only as good as the run behind it.</h2>
          <p>Drumroll turns saved hit records, resolved misses, wrong-pad hits, timing offsets, speed, streaks, and recovery attempts into a next useful rep. If bar-level history is absent, Coach says so rather than inventing a weak bar.</p>
          <details>
            <summary>What a saved session can explain</summary>
            <p>Session mode and configuration, score and streak, lane summaries, timing, wrong-pad hits, resolved misses, recovery summaries, checkpoints, and life events. Full hit records enable exact trouble bars and targeted loops for new runs.</p>
          </details>
        </div>
      </section>

      <section class="web-platform-section" aria-labelledby="web-platform-title">
        <p class="web-section-index">Built for the kit</p>
        <h2 id="web-platform-title">Your drums remain the fastest way forward.</h2>
        <div class="web-platform-grid">
          <p><strong>Ready cue</strong>starts an eligible session with one deliberate kick after a short silence.</p>
          <p><strong>Practice</strong>parks after meaningful silence, rewinds to a musical checkpoint, and resumes from any mapped pad.</p>
          <p><strong>Perform</strong>protects continuity with one canonical, uninterrupted pass.</p>
        </div>
        <p class="web-platform-note">Keyboard and pointer controls remain available for setup and accessibility. Local files, native MIDI, and the full practice setup are desktop-first.</p>
      </section>

      <section class="web-download-section" aria-labelledby="web-download-title">
        <div class="web-download-copy">
          <p class="web-section-index">The desktop release</p>
          <h2 id="web-download-title">Bring the studio to the kit.</h2>
          <p>Drumroll 1.2.0-kb.5 is the Apple Silicon macOS preview. The public artifact is Developer ID signed, Apple notarized, and published with a reproducible SHA-256 checksum.</p>
        </div>
        <div class="web-download-action">
          <a id="desktop-download" href="${publicReleaseHref}">Download Drumroll for Apple Silicon</a>
          <p>Notarized DMG · <a href="${publicChecksumHref}">verify SHA-256</a></p>
        </div>
      </section>

      <section class="web-faq-section" aria-labelledby="web-faq-title">
        <p class="web-section-index">Clear boundaries</p>
        <h2 id="web-faq-title">What Drumroll can say today.</h2>
        <div class="web-faq-list">
          <details><summary>Does it require an electronic drum kit?</summary><p>Drumroll is designed around MIDI input from an electronic kit. Keyboard and pointer controls remain available for setup and accessibility.</p></details>
          <details><summary>Will Coach always show trouble bars?</summary><p>No. Exact trouble bars and targeted loops require a saved run with full hit records. When they exist, every weak loop stays linked to the original review until two consecutive full-coverage, zero-error passes clear it. Summary-only runs can still report their recorded accuracy, timing, lane, wrong-hit, speed, and date.</p></details>
          <details><summary>Is this download link public?</summary><p>Yes. It points to the exact v1.2.0-kb.5 GitHub release asset; SHA256SUMS.txt is published beside it.</p></details>
        </div>
      </section>

      <footer class="web-site-footer">
        <a class="web-wordmark" href="#top">Drumroll<span>Daybreak Arena</span></a>
        <p>A focused, evidence-backed practice game for an electronic drum kit.</p>
        <button type="button" data-testid="start-drumroll-footer">Open Drumroll</button>
      </footer>
    </main>
  `;

  const startButtons = root.querySelectorAll<HTMLButtonElement>(
    '[data-testid^="start-drumroll"]',
  );

  startButtons.forEach((button) => {
    button.addEventListener('click', () => {
      void startApp();
    });
  });

  const navToggle = root.querySelector<HTMLButtonElement>('.web-nav-toggle');
  const nav = root.querySelector<HTMLElement>('.web-site-nav');
  const closeMenu = () => {
    nav?.removeAttribute('data-open');
    navToggle?.setAttribute('aria-expanded', 'false');
  };

  navToggle?.addEventListener('click', () => {
    const open = nav?.getAttribute('data-open') !== 'true';

    nav?.setAttribute('data-open', String(open));
    navToggle.setAttribute('aria-expanded', String(open));
  });
  nav?.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', closeMenu);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeMenu();
    }
  });
}

if (new URLSearchParams(location.search).has('app')) {
  void startApp();
} else {
  showLanding();
}
