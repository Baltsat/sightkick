import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { caCertEnv, resolveCaCertPath } from './stemTools';

describe('resolveCaCertPath', () => {
  const cleanup: string[] = [];

  afterEach(() => {
    for (const file of cleanup.splice(0)) {
      fs.rmSync(file, { recursive: true, force: true });
    }
  });

  it('picks the first candidate that actually exists on disk', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ca-cert-test-'));
    const certPath = path.join(root, 'cert.pem');

    cleanup.push(root);
    fs.writeFileSync(certPath, 'cert bytes');

    expect(resolveCaCertPath(['/definitely/missing/cert.pem', certPath])).toBe(
      certPath,
    );
  });

  it('skips candidates that do not exist and returns undefined when none do', () => {
    expect(
      resolveCaCertPath([
        '/definitely/missing/cert.pem',
        '/also/missing/cert.pem',
      ]),
    ).toBeUndefined();
  });

  it('skips a candidate that is a directory rather than a file', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ca-cert-test-'));

    cleanup.push(root);

    expect(resolveCaCertPath([root])).toBeUndefined();
  });
});

describe('caCertEnv', () => {
  const cleanup: string[] = [];

  afterEach(() => {
    vi.unstubAllEnvs();

    for (const file of cleanup.splice(0)) {
      fs.rmSync(file, { recursive: true, force: true });
    }
  });

  it('sets SSL_CERT_FILE and REQUESTS_CA_BUNDLE to an already-configured CA bundle', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ca-cert-test-'));
    const certPath = path.join(root, 'cert.pem');

    cleanup.push(root);
    fs.writeFileSync(certPath, 'cert bytes');
    vi.stubEnv('SSL_CERT_FILE', certPath);

    expect(caCertEnv()).toEqual({
      SSL_CERT_FILE: certPath,
      REQUESTS_CA_BUNDLE: certPath,
    });
  });

  it('returns an empty env when no CA bundle can be found anywhere', () => {
    vi.stubEnv('SSL_CERT_FILE', '/definitely/missing/cert.pem');
    vi.stubEnv('NODE_EXTRA_CA_CERTS', '/also/missing/cert.pem');
    vi.stubEnv('REQUESTS_CA_BUNDLE', '/still/missing/cert.pem');

    // This only holds on a machine without a system CA bundle at any of the
    // hardcoded fallback paths; resolveCaCertPath's tests above cover the
    // candidate-list logic deterministically regardless of machine state.
    if (
      !fs.existsSync('/etc/ssl/cert.pem') &&
      !fs.existsSync('/etc/ssl/certs/ca-certificates.crt') &&
      !fs.existsSync('/etc/pki/tls/certs/ca-bundle.crt')
    ) {
      expect(caCertEnv()).toEqual({});
    }
  });
});
