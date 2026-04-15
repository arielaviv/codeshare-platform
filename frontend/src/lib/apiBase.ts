/**
 * Single source of truth for backend URLs across the frontend.
 *
 * Dev: defaults to `/api` (relative) so requests go through Vite's proxy
 *      (see `vite.config.ts`) — works on any port Vite picks (5173, 5174…).
 * Prod: set `VITE_API_URL=https://your-backend.example.com/api` at build time.
 *
 * `getApiBase()`    → for fetch / axios / EventSource calls (always ends with `/api`)
 * `getStaticBase()` → for image / file URLs served from `/uploads` (no `/api` suffix)
 */
export function getApiBase(): string {
  const fromEnv = import.meta.env.VITE_API_URL;
  if (fromEnv && typeof fromEnv === 'string' && fromEnv.length > 0) {
    return fromEnv.replace(/\/+$/, '');
  }
  return '/api';
}

export function getStaticBase(): string {
  const apiBase = getApiBase();
  // Strip a trailing `/api` so callers can do `${getStaticBase()}/uploads/foo.png`.
  // For relative defaults (`/api` → ``) the empty string lets Vite's proxy handle `/uploads`.
  return apiBase.replace(/\/api$/, '');
}
