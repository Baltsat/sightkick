import { fireEvent, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { setupSongListView, SongListHarness } from './test-support';

const laptopViewports = [
  { width: 1225, height: 768 },
  { width: 1024, height: 700 },
] as const;
const routes: Array<{
  name: string;
  open: (view: SongListHarness) => void | Promise<void>;
}> = [
  {
    name: 'Home',
    open: () => expect(screen.getByTestId('home-cockpit')).toBeInTheDocument(),
  },
  {
    name: 'Songs',
    open: () => {
      fireEvent.click(screen.getByTestId('view-songs'));
      expect(document.getElementById('library-content')).toBeInTheDocument();
    },
  },
  {
    name: 'My Wave',
    open: () => {
      fireEvent.click(screen.getByTestId('view-wave'));
      expect(screen.getByTestId('my-wave')).toBeInTheDocument();
    },
  },
  {
    name: 'Journey',
    open: () => {
      fireEvent.click(screen.getByTestId('view-lessons'));
      expect(screen.getByText('No lessons found')).toBeInTheDocument();
    },
  },
  {
    // The shell has no "Insights" heading of its own — that copy lives (or
    // used to live) inside ProfileView, which is out of this suite's
    // ownership and free to change wording. What the shell guarantees is
    // its own contract: the persistent rail's profile control opens the
    // route and marks itself as the current page, and the route mounts far
    // enough to prove it lives inside the fixed viewport, not a spinner
    // standing in for it.
    name: 'Profile',
    open: async (view) => {
      view.emit('load-goals', { goals: [] });
      fireEvent.click(screen.getByTestId('open-profile-button'));

      expect(await screen.findByTestId('profile-view')).toBeInTheDocument();
      expect(screen.getByTestId('open-profile-button')).toHaveAttribute(
        'aria-current',
        'page',
      );
    },
  },
];
const originalViewport = {
  width: window.innerWidth,
  height: window.innerHeight,
};
const appShellStyles = readFileSync(
  resolve(process.cwd(), 'src/renderer/components/AppShell/AppShell.css'),
  'utf8',
);
const arenaShellStyles = appShellStyles.match(
  /\.arena-shell\s*\{(?<rules>[^}]*)}/,
)?.groups?.rules;

function setViewport({ width, height }: (typeof laptopViewports)[number]) {
  Object.defineProperties(window, {
    innerWidth: { configurable: true, value: width },
    innerHeight: { configurable: true, value: height },
  });
  window.dispatchEvent(new Event('resize'));
}

function expectFixedOuterViewport() {
  const routeRoot = document.querySelector('.arena-shell');

  expect(routeRoot).toBeInTheDocument();
  expect(routeRoot).toHaveClass('arena-shell');
  expect(arenaShellStyles).toMatch(/height:\s*100vh/);
  expect(arenaShellStyles).toMatch(/overflow:\s*hidden/);
}

afterEach(() => {
  Object.defineProperties(window, {
    innerWidth: { configurable: true, value: originalViewport.width },
    innerHeight: { configurable: true, value: originalViewport.height },
  });
});

describe.each(laptopViewports)(
  'no outer-page scroll at $width×$height',
  (viewport) => {
    it.each(routes)(
      '$name keeps its route root inside the fixed viewport',
      async ({ open }) => {
        setViewport(viewport);

        const view = setupSongListView();

        await open(view);
        expectFixedOuterViewport();
      },
    );
  },
);
