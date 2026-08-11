import { fireEvent, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { setupSongListView } from './test-support';

const laptopViewports = [
  { width: 1225, height: 768 },
  { width: 1024, height: 700 },
] as const;

const routes = [
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
    name: 'Coach',
    open: () => {
      fireEvent.click(screen.getByTestId('view-coach'));
      expect(screen.getByTestId('coach-desk')).toBeInTheDocument();
    },
  },
  {
    name: 'Profile',
    open: () => {
      fireEvent.click(screen.getByTestId('open-profile-button'));
      expect(screen.getByText('Your profile')).toBeInTheDocument();
    },
  },
] as const;

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
      ({ open }) => {
        setViewport(viewport);
        setupSongListView();

        open();
        expectFixedOuterViewport();
      },
    );
  },
);
