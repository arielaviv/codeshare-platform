import type { Sandbox as ComputeSandbox } from '@e2b/code-interpreter';

/**
 * Pandoc + xelatex aren't present in the default E2B compute template.
 * `pip install pypandoc` only ships the Python wrapper — the pandoc binary
 * and xelatex engine must be apt-installed separately. We run this lazily
 * (once per sandbox lifetime) so the first formatter call pays the cost
 * and subsequent calls skip it.
 *
 * Future: bake a custom E2B template with these preinstalled (Slice 10 v2)
 * to eliminate the cold-start delay entirely.
 */

export interface FormatterBootstrapEvents {
  onToolchainInstalling?: () => void;
  onToolchainReady?: () => void;
}

const TOOLCHAIN_PROBE_TIMEOUT_MS = 5_000;
const TOOLCHAIN_INSTALL_TIMEOUT_MS = 240_000; // 4-min ceiling for apt-get
const PYPANDOC_INSTALL_TIMEOUT_MS = 60_000;

/**
 * Probes for pandoc; if missing, apt-installs pandoc + texlive-xetex +
 * font packages, then `pip install pypandoc`. Safe to call repeatedly —
 * no-op when the toolchain is already present.
 *
 * Emits `onToolchainInstalling` when the install starts (so the UI can
 * render "Installing typesetting toolchain — first time only, ~2 minutes")
 * and `onToolchainReady` on success.
 */
export async function ensureFormatterToolchain(
  sbx: ComputeSandbox,
  events: FormatterBootstrapEvents = {}
): Promise<void> {
  const probe = await sbx.commands.run('which pandoc', {
    timeoutMs: TOOLCHAIN_PROBE_TIMEOUT_MS,
  }).catch(() => null);

  if (probe && probe.exitCode === 0 && probe.stdout.trim().length > 0) {
    events.onToolchainReady?.();
    return;
  }

  events.onToolchainInstalling?.();

  const aptCmd =
    'apt-get update && ' +
    'apt-get install -y --no-install-recommends ' +
    'pandoc texlive-xetex texlive-fonts-recommended texlive-lang-english fonts-liberation';

  const aptResult = await sbx.commands.run(aptCmd, {
    timeoutMs: TOOLCHAIN_INSTALL_TIMEOUT_MS,
  });

  if (aptResult.exitCode !== 0) {
    throw new Error(
      `Formatter toolchain install failed (apt exit ${aptResult.exitCode}): ` +
        (aptResult.stderr.slice(0, 400) || aptResult.error || 'unknown error')
    );
  }

  const pipResult = await sbx.commands.run('pip install --quiet pypandoc', {
    timeoutMs: PYPANDOC_INSTALL_TIMEOUT_MS,
  });

  if (pipResult.exitCode !== 0) {
    throw new Error(
      `pypandoc install failed (pip exit ${pipResult.exitCode}): ` +
        (pipResult.stderr.slice(0, 400) || pipResult.error || 'unknown error')
    );
  }

  events.onToolchainReady?.();
}
