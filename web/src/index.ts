import { installWebPlatform } from '../../src/platform/web';
import './web.css';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Missing app root.');
}

function webToolbar(): HTMLElement {
  const toolbar = document.createElement('aside');

  toolbar.className = 'web-toolbar';
  toolbar.dataset.testid = 'web-toolbar';
  toolbar.innerHTML = `
    <span>web import · 3 songs/hour/IP</span>
    <a href="https://github.com/Baltsat/sightkick/releases/latest" target="_blank" rel="noreferrer">get the desktop app ↗</a>
  `;

  return toolbar;
}

async function startApp(): Promise<void> {
  installWebPlatform();
  document.documentElement.dataset.platform = 'web';
  root.replaceChildren();
  document.body.append(webToolbar());
  localStorage.setItem('drumroll.web.welcome-seen', 'true');
  await import('../../src/renderer/index');
}

function showLanding(): void {
  root.innerHTML = `
    <main class="web-landing">
      <section class="web-landing-copy">
        <p class="web-eyebrow">drum practice that reads the room</p>
        <h1>play the kit.<br />see the rhythm.</h1>
        <p class="web-lede">Drumroll gives you 118 guided lessons, live notation, and scoring in Chrome. Connect a Web MIDI drum kit or start with your keyboard.</p>
        <div class="web-actions">
          <button type="button" data-testid="start-drumroll">start practicing</button>
          <a href="https://github.com/Baltsat/sightkick/releases/latest" target="_blank" rel="noreferrer">get the desktop app</a>
        </div>
        <p class="web-fineprint">Your progress and imported charts stay in this browser. YouTube imports are limited to 3 per hour per IP.</p>
      </section>
      <section class="web-proof" aria-label="Drumroll web capabilities">
        <div><strong>118</strong><span>original lessons</span></div>
        <div><strong>MIDI</strong><span>Chrome + HTTPS</span></div>
        <div><strong>local</strong><span>scores and imports</span></div>
      </section>
    </main>
  `;

  root
    .querySelector<HTMLButtonElement>('[data-testid="start-drumroll"]')
    ?.addEventListener('click', () => {
      void startApp();
    });
}

if (
  localStorage.getItem('drumroll.web.welcome-seen') === 'true' ||
  new URLSearchParams(location.search).has('app')
) {
  void startApp();
} else {
  showLanding();
}
