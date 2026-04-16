/**
 * Parse + serialize the generated app's shadcn-style theme tokens in
 * src/index.css. The token values are stored as "R G B" triplets per
 * shadcn convention so Tailwind's `bg-background` etc. composes with
 * opacity modifiers.
 */

export type ThemeToken =
  | 'background'
  | 'foreground'
  | 'card'
  | 'card-foreground'
  | 'popover'
  | 'popover-foreground'
  | 'primary'
  | 'primary-foreground'
  | 'secondary'
  | 'secondary-foreground'
  | 'muted'
  | 'muted-foreground'
  | 'accent'
  | 'accent-foreground'
  | 'destructive'
  | 'destructive-foreground'
  | 'border'
  | 'input'
  | 'ring'
  | 'chart-1'
  | 'chart-2'
  | 'chart-3'
  | 'chart-4'
  | 'chart-5'
  | 'sidebar-background'
  | 'sidebar-foreground'
  | 'sidebar-primary'
  | 'sidebar-primary-foreground'
  | 'sidebar-accent'
  | 'sidebar-accent-foreground'
  | 'sidebar-border'
  | 'sidebar-ring';

export const THEME_TOKENS: ThemeToken[] = [
  'background', 'foreground',
  'card', 'card-foreground',
  'popover', 'popover-foreground',
  'primary', 'primary-foreground',
  'secondary', 'secondary-foreground',
  'muted', 'muted-foreground',
  'accent', 'accent-foreground',
  'destructive', 'destructive-foreground',
  'border', 'input', 'ring',
  'chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5',
  'sidebar-background', 'sidebar-foreground',
  'sidebar-primary', 'sidebar-primary-foreground',
  'sidebar-accent', 'sidebar-accent-foreground',
  'sidebar-border', 'sidebar-ring',
];

export interface Theme {
  colors: Partial<Record<ThemeToken, string>>; // hex (#RRGGBB)
  fontSans: string;
  fontDisplay: string;
}

export const DEFAULT_THEME: Theme = {
  colors: {
    background: '#0A0A0A',
    foreground: '#F5F5F5',
    card: '#121212',
    'card-foreground': '#F5F5F5',
    popover: '#121212',
    'popover-foreground': '#F5F5F5',
    primary: '#DC2828',
    'primary-foreground': '#FFFFFF',
    secondary: '#1F1F1F',
    'secondary-foreground': '#F5F5F5',
    muted: '#1F1F1F',
    'muted-foreground': '#8C8C8C',
    accent: '#DC2828',
    'accent-foreground': '#FFFFFF',
    destructive: '#EF4444',
    'destructive-foreground': '#FAFAFA',
    border: '#242424',
    input: '#242424',
    ring: '#DC2828',
    'chart-1': '#DC2828',
    'chart-2': '#666666',
    'chart-3': '#999999',
    'chart-4': '#CCCCCC',
    'chart-5': '#993333',
    'sidebar-background': '#0D0D0D',
    'sidebar-foreground': '#F5F5F5',
    'sidebar-primary': '#DC2828',
    'sidebar-primary-foreground': '#FFFFFF',
    'sidebar-accent': '#1A1A1A',
    'sidebar-accent-foreground': '#F5F5F5',
    'sidebar-border': '#242424',
    'sidebar-ring': '#DC2828',
  },
  fontSans: "'Inter', system-ui, sans-serif",
  fontDisplay: "'Inter', system-ui, sans-serif",
};

function hexToRgbTriplet(hex: string): string {
  const m = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return '0 0 0';
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `${r} ${g} ${b}`;
}

function rgbTripletToHex(triplet: string): string {
  const parts = triplet.trim().split(/\s+/);
  if (parts.length !== 3) return '#000000';
  const [r, g, b] = parts.map((s) => Math.max(0, Math.min(255, parseInt(s, 10) || 0)));
  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Strip an existing `:root { … }` block + any `@theme` block and return
 * the remainder so we can splice in a fresh one.
 */
function stripThemeBlocks(css: string): string {
  return css
    .replace(/:root\s*\{[^}]*\}/g, '')
    .replace(/@theme\s*\{[^}]*\}/g, '')
    .trimStart();
}

export function serializeThemeToCss(theme: Theme, existingCss: string): string {
  const colors = { ...DEFAULT_THEME.colors, ...theme.colors };
  const lines = THEME_TOKENS.map((token) => {
    const hex = colors[token] ?? DEFAULT_THEME.colors[token]!;
    return `  --${token}: ${hexToRgbTriplet(hex)};`;
  });
  lines.push(`  --font-sans: ${theme.fontSans};`);
  lines.push(`  --font-display: ${theme.fontDisplay};`);
  const block = `:root {\n${lines.join('\n')}\n}`;
  const stripped = stripThemeBlocks(existingCss);
  return `${block}\n\n${stripped}`.trim() + '\n';
}

export function parseThemeFromCss(css: string): Theme {
  const colors: Partial<Record<ThemeToken, string>> = {};
  const root = /:root\s*\{([^}]*)\}/.exec(css);
  if (root) {
    const body = root[1];
    for (const token of THEME_TOKENS) {
      const re = new RegExp(`--${token}\\s*:\\s*([^;]+);`);
      const m = re.exec(body);
      if (m) colors[token] = rgbTripletToHex(m[1]);
    }
  }
  const fontMatch = /--font-sans\s*:\s*([^;]+);/.exec(css);
  const dispMatch = /--font-display\s*:\s*([^;]+);/.exec(css);
  return {
    colors,
    fontSans: fontMatch?.[1].trim() ?? DEFAULT_THEME.fontSans,
    fontDisplay: dispMatch?.[1].trim() ?? DEFAULT_THEME.fontDisplay,
  };
}

export const FONT_OPTIONS = [
  { name: 'Inter', stack: "'Inter', system-ui, sans-serif", url: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap' },
  { name: 'Manrope', stack: "'Manrope', system-ui, sans-serif", url: 'https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap' },
  { name: 'Space Grotesk', stack: "'Space Grotesk', system-ui, sans-serif", url: 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap' },
  { name: 'Roboto', stack: "'Roboto', system-ui, sans-serif", url: 'https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700;900&display=swap' },
  { name: 'Open Sans', stack: "'Open Sans', system-ui, sans-serif", url: 'https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;500;600;700;800&display=swap' },
  { name: 'Montserrat', stack: "'Montserrat', system-ui, sans-serif", url: 'https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap' },
  { name: 'Lato', stack: "'Lato', system-ui, sans-serif", url: 'https://fonts.googleapis.com/css2?family=Lato:wght@400;700;900&display=swap' },
  { name: 'Poppins', stack: "'Poppins', system-ui, sans-serif", url: 'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap' },
  { name: 'Nunito', stack: "'Nunito', system-ui, sans-serif", url: 'https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800&display=swap' },
] as const;

export function findFontByStack(stack: string): (typeof FONT_OPTIONS)[number] {
  const norm = stack.replace(/["']/g, '').trim();
  return (
    FONT_OPTIONS.find((f) => f.stack.replace(/["']/g, '').trim() === norm) ??
    FONT_OPTIONS[0]
  );
}

/** Splice a Google Fonts <link> into index.html for the chosen font. */
export function applyFontLinkToHtml(html: string, fontUrls: string[]): string {
  const linksBlock = fontUrls
    .map((u) => `<link href="${u}" rel="stylesheet">`)
    .join('\n    ');
  const preconnect = [
    '<link rel="preconnect" href="https://fonts.googleapis.com">',
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
  ].join('\n    ');
  // Remove any existing Mr8-inserted block.
  const cleaned = html.replace(
    /\s*<!-- mr8-fonts:start -->[\s\S]*?<!-- mr8-fonts:end -->/g,
    ''
  );
  const injection = `\n    <!-- mr8-fonts:start -->\n    ${preconnect}\n    ${linksBlock}\n    <!-- mr8-fonts:end -->`;
  if (cleaned.includes('</head>')) {
    return cleaned.replace('</head>', `${injection}\n  </head>`);
  }
  return cleaned + injection;
}
