import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import { StemToolsManifest } from '../types';

export const STEM_TOOLS_REPO = 'tonygoldcrest/sightkick-tools';

export function getPlatformSlug(): string | undefined {
  if (process.platform === 'darwin' && process.arch === 'arm64') {
    return 'mac-arm64';
  }

  if (process.platform === 'win32') {
    return 'win-x64';
  }

  return undefined;
}

export function isSupported(): boolean {
  return getPlatformSlug() !== undefined;
}

export function getArchiveName(slug: string): string {
  return `demucs-split-${slug}.tar.gz`;
}

export function getManifestName(slug: string): string {
  return `manifest-${slug}.json`;
}

export function releaseAssetUrl(asset: string): string {
  return `https://github.com/${STEM_TOOLS_REPO}/releases/latest/download/${asset}`;
}

export function getStemToolsDir(): string {
  return path.join(app.getPath('userData'), 'stem-tools');
}

export function getBundleDir(): string {
  return path.join(getStemToolsDir(), 'demucs-split');
}

export function getBinaryPath(): string {
  const binaryName =
    process.platform === 'win32' ? 'demucs-split.exe' : 'demucs-split';

  return path.join(getBundleDir(), binaryName);
}

export function getInstalledManifestPath(): string {
  return path.join(getBundleDir(), 'manifest.json');
}

export function readInstalledManifest(): StemToolsManifest | undefined {
  try {
    const raw = fs.readFileSync(getInstalledManifestPath(), 'utf-8');

    return JSON.parse(raw) as StemToolsManifest;
  } catch {
    return undefined;
  }
}

export function isInstalled(): boolean {
  return (
    readInstalledManifest() !== undefined && fs.existsSync(getBinaryPath())
  );
}

export function normalizeVersion(version: string): string {
  return version.replace(/^v/, '');
}

function defaultCaCertCandidates(): string[] {
  return [
    process.env.SSL_CERT_FILE,
    process.env.NODE_EXTRA_CA_CERTS,
    process.env.REQUESTS_CA_BUNDLE,
    '/etc/ssl/cert.pem',
    '/etc/ssl/certs/ca-certificates.crt',
    '/etc/pki/tls/certs/ca-bundle.crt',
  ].filter((value): value is string => Boolean(value));
}

// demucs-split's first run downloads model weights over HTTPS via Python's
// requests/urllib. Spawned without CA certificates in its env, that
// download fails with SSL: CERTIFICATE_VERIFY_FAILED because the child
// process cannot discover the system trust store on its own. Resolve a CA
// bundle robustly (respecting any CA env vars already set) and fall back to
// macOS's default bundle at /etc/ssl/cert.pem.
export function resolveCaCertPath(
  candidates: string[] = defaultCaCertCandidates(),
): string | undefined {
  return candidates.find((candidate) => {
    try {
      return fs.statSync(candidate).isFile();
    } catch {
      return false;
    }
  });
}

export function caCertEnv(): NodeJS.ProcessEnv {
  const caCertPath = resolveCaCertPath();

  return caCertPath
    ? { SSL_CERT_FILE: caCertPath, REQUESTS_CA_BUNDLE: caCertPath }
    : {};
}
