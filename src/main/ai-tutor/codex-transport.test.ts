import { describe, expect, it } from 'vitest';
import { build_codex_shell_command } from './codex-transport';

describe('Codex AI tutor shell transport', () => {
  it('uses an absolute binary and closes stdin for the non-interactive run', () => {
    const command = build_codex_shell_command(
      '/Users/player/.bun/bin/codex',
      '/tmp/schema.json',
      '/tmp/output.json',
      "teacher's practice state",
    );

    expect(command).toContain("'/Users/player/.bun/bin/codex' 'exec'");
    expect(command).toContain("'--output-schema' '/tmp/schema.json'");
    expect(command).toContain("'--output-last-message' '/tmp/output.json'");
    expect(command).toContain("'teacher'\"'\"'s practice state'");
    expect(command).toMatch(/<\/dev\/null$/);
    expect(command).not.toContain(' -m ');
  });

  it('rejects a relative Codex binary path', () => {
    expect(() =>
      build_codex_shell_command(
        'codex',
        '/tmp/schema.json',
        '/tmp/output.json',
        'state',
      ),
    ).toThrow('The Codex binary path must be absolute.');
  });
});
