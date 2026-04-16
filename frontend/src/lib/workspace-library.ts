/**
 * Scan the WebContainer-mounted files for every asset the generated
 * app uses. Returns a flat list the Library panel groups and renders.
 *
 * Sources of image URLs:
 *  - <img src="…">    in .tsx | .jsx | .html | .svelte | .vue
 *  - bg-[url(…)]      arbitrary-value utilities in JSX strings
 *  - url(…)           inside .css
 *  - backgroundImage: 'url(…)'   in JSX style props
 */

export interface LibraryAsset {
  id: string;
  kind: 'image' | 'app';
  name: string;
  url: string;
  sourceRefs: string[];
  /** True when the URL is external (Unsplash, our /uploads, etc.)
   *  so rename-in-source only changes the display name, not the URL. */
  external: boolean;
}

const CODE_FILE = /\.(tsx|jsx|ts|js|html|svelte|vue)$/i;
const CSS_FILE = /\.css$/i;

const IMG_SRC_RE = /<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi;
const BG_URL_RE = /bg-\[url\(["']?([^"')]+)["']?\)\]/g;
const CSS_URL_RE = /url\(\s*["']?([^"')]+)["']?\s*\)/g;
const STYLE_BG_URL_RE = /backgroundImage\s*:\s*["'`]url\(\s*["']?([^"')]+)["']?\s*\)/g;

function extractImageUrls(content: string, isCss: boolean): string[] {
  const found = new Set<string>();
  const addIfImage = (u: string) => {
    if (!u) return;
    if (/^data:/i.test(u)) return;
    found.add(u.trim());
  };
  if (isCss) {
    let m: RegExpExecArray | null;
    while ((m = CSS_URL_RE.exec(content))) addIfImage(m[1]);
  } else {
    let m: RegExpExecArray | null;
    while ((m = IMG_SRC_RE.exec(content))) addIfImage(m[1]);
    while ((m = BG_URL_RE.exec(content))) addIfImage(m[1]);
    while ((m = STYLE_BG_URL_RE.exec(content))) addIfImage(m[1]);
  }
  return Array.from(found);
}

function isExternalUrl(url: string): boolean {
  return (
    /^https?:\/\//i.test(url) ||
    url.startsWith('//') ||
    url.startsWith('/uploads/')
  );
}

function deriveName(url: string): string {
  try {
    const u = url.startsWith('http') ? new URL(url) : new URL(url, 'http://x');
    const last = u.pathname.split('/').pop() ?? url;
    const trimmed = last.split('?')[0];
    if (trimmed) return trimmed;
  } catch {
    // fall through
  }
  const parts = url.split(/[\\/]/);
  return parts[parts.length - 1] || url;
}

export function scanAssetsFromWorkspace(
  files: Map<string, string>,
  projectName: string
): LibraryAsset[] {
  const perUrl = new Map<string, LibraryAsset>();

  for (const [path, content] of files) {
    if (CODE_FILE.test(path)) {
      for (const url of extractImageUrls(content, false)) {
        const existing = perUrl.get(url);
        if (existing) {
          existing.sourceRefs.push(path);
        } else {
          perUrl.set(url, {
            id: `asset-${perUrl.size}`,
            kind: 'image',
            name: deriveName(url),
            url,
            sourceRefs: [path],
            external: isExternalUrl(url),
          });
        }
      }
    } else if (CSS_FILE.test(path)) {
      for (const url of extractImageUrls(content, true)) {
        const existing = perUrl.get(url);
        if (existing) existing.sourceRefs.push(path);
        else
          perUrl.set(url, {
            id: `asset-${perUrl.size}`,
            kind: 'image',
            name: deriveName(url),
            url,
            sourceRefs: [path],
            external: isExternalUrl(url),
          });
      }
    }
  }

  const images = Array.from(perUrl.values());
  const appSelf: LibraryAsset = {
    id: 'app-self',
    kind: 'app',
    name: projectName || 'Your app',
    url: '',
    sourceRefs: [],
    external: false,
  };
  return [appSelf, ...images];
}

/**
 * Remove every `<img src="OLDURL">`, `bg-[url(OLDURL)]`, and
 * `url(OLDURL)` occurrence from the workspace. Returns a new Map
 * with the references stripped. For `<img>`, the tag becomes
 * `<img src="">` so JSX/HTML stays syntactically valid — the agent
 * can replace it on a later edit.
 */
export function removeAssetReferences(
  files: Map<string, string>,
  url: string
): Map<string, string> {
  const next = new Map(files);
  const escaped = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const imgRe = new RegExp(`(<img\\b[^>]*\\bsrc\\s*=\\s*["'])${escaped}(["'])`, 'g');
  const bgRe = new RegExp(`bg-\\[url\\(["']?${escaped}["']?\\)\\]`, 'g');
  const cssRe = new RegExp(`url\\(\\s*["']?${escaped}["']?\\s*\\)`, 'g');
  for (const [path, content] of files) {
    if (!content.includes(url)) continue;
    let updated = content;
    if (CODE_FILE.test(path)) {
      updated = updated.replace(imgRe, '$1$2');
      updated = updated.replace(bgRe, '');
    } else if (CSS_FILE.test(path)) {
      updated = updated.replace(cssRe, 'none');
    }
    if (updated !== content) next.set(path, updated);
  }
  return next;
}

/** Rewrite every reference to `oldUrl` → `newUrl` in the workspace. */
export function renameAssetReferences(
  files: Map<string, string>,
  oldUrl: string,
  newUrl: string
): Map<string, string> {
  const next = new Map(files);
  const escaped = oldUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(escaped, 'g');
  for (const [path, content] of files) {
    if (!content.includes(oldUrl)) continue;
    next.set(path, content.replace(re, newUrl));
  }
  return next;
}
