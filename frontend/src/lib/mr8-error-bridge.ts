/**
 * Source of the small client script Mr8 injects into every WebContainer
 * preview. It forwards build + runtime errors to the parent window so we
 * can render a friendly overlay + "Solve with AI" button instead of
 * Vite's raw red plugin-error card.
 *
 * This is exported as a STRING (not a module) because it's written to
 * the WebContainer filesystem at mount time, not bundled into the host.
 */
export const MR8_ERROR_BRIDGE_SOURCE = `// mr8-error-bridge.js — managed by Mr8. Do not edit.
(function () {
  try {
    var style = document.createElement('style');
    style.textContent =
      'vite-error-overlay{display:none!important}' +
      'vite-error-overlay::part(container){display:none!important}';
    document.head.appendChild(style);
  } catch (_) {}

  function post(payload) {
    try { window.parent.postMessage(payload, '*'); } catch (_) {}
  }

  function forwardError(err) {
    post({
      type: 'mr8/preview-error',
      message: (err && err.message) || String(err || 'Unknown error'),
      stack: err && err.stack,
      file: err && (err.file || (err.loc && err.loc.file) || err.filename),
      line: err && (err.line || (err.loc && err.loc.line) || err.lineno),
    });
  }

  function clearError() {
    post({ type: 'mr8/preview-error-clear' });
  }

  if (typeof import.meta !== 'undefined' && import.meta.hot) {
    import.meta.hot.on('vite:error', function (payload) {
      var err = (payload && payload.err) || payload;
      forwardError(err);
    });
    import.meta.hot.on('vite:beforeUpdate', clearError);
    import.meta.hot.on('vite:afterUpdate', clearError);
  }

  window.addEventListener('error', function (e) {
    forwardError({
      message: e.message,
      stack: e.error && e.error.stack,
      filename: e.filename,
      lineno: e.lineno,
    });
  });

  window.addEventListener('unhandledrejection', function (e) {
    var reason = e.reason;
    forwardError({
      message: (reason && reason.message) || String(reason),
      stack: reason && reason.stack,
    });
  });
})();
`;

const BRIDGE_TAG = '<script type="module" src="/mr8-error-bridge.js"></script>';
const BRIDGE_MARKER = 'mr8-error-bridge.js';

/** Splice the Mr8 error bridge into an HTML doc exactly once. */
export function injectBridgeIntoHtml(html: string): string {
  if (html.includes(BRIDGE_MARKER)) return html;
  if (html.includes('</body>')) {
    return html.replace('</body>', `  ${BRIDGE_TAG}\n</body>`);
  }
  if (html.includes('</html>')) {
    return html.replace('</html>', `${BRIDGE_TAG}\n</html>`);
  }
  return html + '\n' + BRIDGE_TAG + '\n';
}

/**
 * Returns a Map with the Mr8 preview instrumentation applied:
 *   - mr8-error-bridge.js placed at project root
 *   - index.html patched to include the bridge script
 * The caller is responsible for also adding .env etc.
 */
export function withPreviewInstrumentation(files: Map<string, string>): Map<string, string> {
  const out = new Map(files);
  out.set('mr8-error-bridge.js', MR8_ERROR_BRIDGE_SOURCE);
  const html = out.get('index.html');
  if (typeof html === 'string') {
    out.set('index.html', injectBridgeIntoHtml(html));
  }
  return out;
}
