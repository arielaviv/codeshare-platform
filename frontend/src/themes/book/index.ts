/**
 * Book Themes — frontend mirror of backend/src/services/book/themes/index.ts.
 *
 * Duplicated verbatim (not imported cross-runtime because the backend compiles
 * to CommonJS and this ships via Vite). Keep the two files in sync manually —
 * any spec change must land in both.
 *
 * This module additionally exports per-theme CSS strings that the Studio's
 * cover canvas and chapter reader consume. The CSS is injected at the
 * BookStudioPanel root via a <style> block keyed on `book.themeId`.
 */

export type BookThemeId =
  | 'literary-classic'
  | 'literary-modern'
  | 'thriller-tight'
  | 'children-warm'
  | 'nonfiction-clean'
  | 'memoir-warm';

export type TrimSize = '5x8' | '5.5x8.5' | '6x9';
export type TitleTreatment =
  | 'bold-sans'
  | 'serif-elegant'
  | 'display-script'
  | 'condensed-tall'
  | 'distressed'
  | 'modern-mono';

export interface BookThemeSpec {
  id: BookThemeId;
  displayName: string;
  tagline: string;
  idealFor: string[];
  coverTitleTreatment: TitleTreatment;
  bodyFontFamily: string;
  bodyFontGoogleName: string;
  chapterHeadingFontFamily: string;
  chapterHeadingFontGoogleName: string;
  bodyFontSizePt: number;
  bodyLeadingPt: number;
  firstLineIndentEm: number;
  chapterOpenerStyle:
    | 'centered-smallcaps'
    | 'left-tight'
    | 'allcaps-huge-number'
    | 'colored-bold'
    | 'right-italic-smallcaps'
    | 'mono-big';
  dropCapEnabled: boolean;
  dropCapLines: number;
  sceneBreakOrnament: string;
  trimSize: TrimSize;
  marginTopIn: number;
  marginBottomIn: number;
  marginInnerIn: number;
  marginOuterIn: number;
  runningHeadStyle: 'title-author' | 'author-chapter' | 'none';
  pageNumberPosition: 'footer-center' | 'footer-outer' | 'none';
  previewPalette: [string, string, string];
}

export const BOOK_THEMES: Record<BookThemeId, BookThemeSpec> = {
  'literary-classic': {
    id: 'literary-classic',
    displayName: 'Literary Classic',
    tagline: 'Editorial serif, drop caps, timeless page architecture.',
    idealFor: ['literary fiction', 'memoir', 'essay', 'literary thriller'],
    coverTitleTreatment: 'serif-elegant',
    bodyFontFamily: "'EB Garamond', 'Garamond', 'Times New Roman', serif",
    bodyFontGoogleName: 'EB+Garamond:ital,wght@0,400;0,500;0,600;1,400&display=swap',
    chapterHeadingFontFamily: "'Playfair Display', 'Garamond', serif",
    chapterHeadingFontGoogleName: 'Playfair+Display:wght@400;600;700&display=swap',
    bodyFontSizePt: 11,
    bodyLeadingPt: 15,
    firstLineIndentEm: 1,
    chapterOpenerStyle: 'centered-smallcaps',
    dropCapEnabled: true,
    dropCapLines: 3,
    sceneBreakOrnament: '⋯',
    trimSize: '6x9',
    marginTopIn: 0.75,
    marginBottomIn: 1.0,
    marginInnerIn: 1.0,
    marginOuterIn: 0.75,
    runningHeadStyle: 'title-author',
    pageNumberPosition: 'footer-center',
    previewPalette: ['#FDFBF6', '#1F1B17', '#8C6B3F'],
  },
  'literary-modern': {
    id: 'literary-modern',
    displayName: 'Literary Modern',
    tagline: 'Contemporary serif body, tight sans headings, editorial breathing room.',
    idealFor: ['contemporary fiction', 'creative non-fiction', 'literary thriller', 'short stories'],
    coverTitleTreatment: 'condensed-tall',
    bodyFontFamily: "'Source Serif Pro', 'Georgia', serif",
    bodyFontGoogleName: 'Source+Serif+Pro:ital,wght@0,400;0,600;1,400&display=swap',
    chapterHeadingFontFamily: "'Inter', system-ui, sans-serif",
    chapterHeadingFontGoogleName: 'Inter:wght@400;600;700;900&display=swap',
    bodyFontSizePt: 10.5,
    bodyLeadingPt: 14,
    firstLineIndentEm: 1,
    chapterOpenerStyle: 'left-tight',
    dropCapEnabled: true,
    dropCapLines: 2,
    sceneBreakOrnament: '❖',
    trimSize: '6x9',
    marginTopIn: 0.75,
    marginBottomIn: 0.9,
    marginInnerIn: 0.9,
    marginOuterIn: 0.75,
    runningHeadStyle: 'title-author',
    pageNumberPosition: 'footer-outer',
    previewPalette: ['#FAFAF7', '#111111', '#2E4B6B'],
  },
  'thriller-tight': {
    id: 'thriller-tight',
    displayName: 'Thriller',
    tagline: 'Tight pages, stark sans chapter titles, no filler.',
    idealFor: ['thriller', 'crime', 'mystery', 'suspense', 'horror'],
    coverTitleTreatment: 'bold-sans',
    bodyFontFamily: "'Inter', 'Helvetica Neue', sans-serif",
    bodyFontGoogleName: 'Inter:wght@400;500;700&display=swap',
    chapterHeadingFontFamily: "'Inter', 'Helvetica Neue', sans-serif",
    chapterHeadingFontGoogleName: 'Inter:wght@400;500;700;900&display=swap',
    bodyFontSizePt: 10,
    bodyLeadingPt: 13,
    firstLineIndentEm: 1,
    chapterOpenerStyle: 'allcaps-huge-number',
    dropCapEnabled: false,
    dropCapLines: 0,
    sceneBreakOrnament: '——',
    trimSize: '6x9',
    marginTopIn: 0.65,
    marginBottomIn: 0.85,
    marginInnerIn: 0.85,
    marginOuterIn: 0.65,
    runningHeadStyle: 'author-chapter',
    pageNumberPosition: 'footer-outer',
    previewPalette: ['#0C0C0F', '#F4F4F4', '#C9242B'],
  },
  'children-warm': {
    id: 'children-warm',
    displayName: "Children's",
    tagline: 'Big-type body, playful serif headings, generous margins.',
    idealFor: ["children's", 'middle grade', 'cozy family', 'picture book companion'],
    coverTitleTreatment: 'bold-sans',
    bodyFontFamily: "'Fraunces', 'Georgia', serif",
    bodyFontGoogleName: 'Fraunces:ital,wght@0,400;0,500;0,700;1,400&display=swap',
    chapterHeadingFontFamily: "'Fraunces', 'Georgia', serif",
    chapterHeadingFontGoogleName: 'Fraunces:ital,wght@0,600;0,700;0,900&display=swap',
    bodyFontSizePt: 14,
    bodyLeadingPt: 20,
    firstLineIndentEm: 0,
    chapterOpenerStyle: 'colored-bold',
    dropCapEnabled: true,
    dropCapLines: 3,
    sceneBreakOrnament: '★',
    trimSize: '5.5x8.5',
    marginTopIn: 0.85,
    marginBottomIn: 1.0,
    marginInnerIn: 0.9,
    marginOuterIn: 0.75,
    runningHeadStyle: 'none',
    pageNumberPosition: 'footer-center',
    previewPalette: ['#FFF7E8', '#1F2937', '#E07A2F'],
  },
  'nonfiction-clean': {
    id: 'nonfiction-clean',
    displayName: 'Non-Fiction',
    tagline: 'Crisp sans body, bold chapter openers, zero clutter.',
    idealFor: ['how-to', 'guide', 'business', 'self-help', 'tech non-fiction'],
    coverTitleTreatment: 'bold-sans',
    bodyFontFamily: "'Source Sans 3', 'Helvetica Neue', sans-serif",
    bodyFontGoogleName: 'Source+Sans+3:ital,wght@0,400;0,600;0,700;1,400&display=swap',
    chapterHeadingFontFamily: "'Inter', 'Helvetica Neue', sans-serif",
    chapterHeadingFontGoogleName: 'Inter:wght@400;600;700;900&display=swap',
    bodyFontSizePt: 11,
    bodyLeadingPt: 16,
    firstLineIndentEm: 0,
    chapterOpenerStyle: 'left-tight',
    dropCapEnabled: false,
    dropCapLines: 0,
    sceneBreakOrnament: '——',
    trimSize: '6x9',
    marginTopIn: 0.75,
    marginBottomIn: 0.9,
    marginInnerIn: 0.9,
    marginOuterIn: 0.75,
    runningHeadStyle: 'title-author',
    pageNumberPosition: 'footer-outer',
    previewPalette: ['#FFFFFF', '#0B1220', '#1D4ED8'],
  },
  'memoir-warm': {
    id: 'memoir-warm',
    displayName: 'Memoir',
    tagline: 'Warm serif, italicized openers, vintage composition.',
    idealFor: ['memoir', 'biography', 'letters', 'slow literature', 'nature writing'],
    coverTitleTreatment: 'serif-elegant',
    bodyFontFamily: "'Crimson Pro', 'Georgia', serif",
    bodyFontGoogleName: 'Crimson+Pro:ital,wght@0,400;0,600;1,400;1,600&display=swap',
    chapterHeadingFontFamily: "'Crimson Pro', 'Georgia', serif",
    chapterHeadingFontGoogleName: 'Crimson+Pro:ital,wght@0,500;0,700;1,500;1,700&display=swap',
    bodyFontSizePt: 11,
    bodyLeadingPt: 16,
    firstLineIndentEm: 1,
    chapterOpenerStyle: 'right-italic-smallcaps',
    dropCapEnabled: true,
    dropCapLines: 2,
    sceneBreakOrnament: '·   ·   ·',
    trimSize: '6x9',
    marginTopIn: 0.85,
    marginBottomIn: 1.0,
    marginInnerIn: 1.0,
    marginOuterIn: 0.85,
    runningHeadStyle: 'title-author',
    pageNumberPosition: 'footer-center',
    previewPalette: ['#F6F0E4', '#2A1F16', '#7A3B2E'],
  },
};

export const BOOK_THEME_IDS = Object.keys(BOOK_THEMES) as BookThemeId[];

/**
 * CSS that the BookStudioPanel injects under a scope class (`.book-theme-<id>`)
 * so multiple themes can coexist in the DOM without clashing. The Cover canvas
 * and Chapter reader apply the scope class to their root; all typography flows
 * from there.
 */
export function buildBookThemeCss(theme: BookThemeSpec): string {
  const scope = `.book-theme-${theme.id}`;
  const bodyPx = theme.bodyFontSizePt * 1.3333; // pt → px approximation for on-screen preview
  const leadingPx = theme.bodyLeadingPt * 1.3333;
  const indentEm = theme.firstLineIndentEm;
  const dropCapFontFamily = theme.chapterHeadingFontFamily;
  const [bgColor, textColor, accentColor] = theme.previewPalette;

  return `
${scope} {
  --book-bg: ${bgColor};
  --book-text: ${textColor};
  --book-accent: ${accentColor};
  background: var(--book-bg);
  color: var(--book-text);
  font-family: ${theme.bodyFontFamily};
  font-size: ${bodyPx.toFixed(2)}px;
  line-height: ${leadingPx.toFixed(2)}px;
  font-feature-settings: 'kern', 'liga', 'onum';
}
${scope} .book-body p {
  margin: 0;
  text-indent: ${indentEm}em;
  hyphens: auto;
  text-align: justify;
}
${scope} .book-body p:first-of-type,
${scope} .book-body p.no-indent,
${scope} .book-body p + .book-scene-break + p {
  text-indent: 0;
}
${scope} .book-body em { font-style: italic; }
${scope} .book-body strong { font-weight: 600; }
${scope} .book-chapter-heading {
  font-family: ${theme.chapterHeadingFontFamily};
  color: var(--book-text);
  margin: 0 0 1.5em 0;
  ${renderChapterOpenerCss(theme)}
}
${scope} .book-chapter-number {
  font-family: ${theme.chapterHeadingFontFamily};
  color: var(--book-accent);
}
${theme.dropCapEnabled ? renderDropCapCss(scope, dropCapFontFamily, theme.dropCapLines, accentColor) : ''}
${scope} .book-scene-break {
  display: block;
  text-align: center;
  margin: 1.4em 0;
  font-family: ${theme.chapterHeadingFontFamily};
  color: var(--book-accent);
  letter-spacing: 0.4em;
  font-size: 0.9em;
  opacity: 0.75;
}
${scope} .book-scene-break::before {
  content: "${theme.sceneBreakOrnament}";
}
${scope} .book-running-head {
  font-family: ${theme.chapterHeadingFontFamily};
  font-size: 0.65em;
  color: var(--book-text);
  opacity: 0.55;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
${scope} .book-page-number {
  font-family: ${theme.chapterHeadingFontFamily};
  font-size: 0.72em;
  color: var(--book-text);
  opacity: 0.55;
}
`;
}

function renderChapterOpenerCss(theme: BookThemeSpec): string {
  switch (theme.chapterOpenerStyle) {
    case 'centered-smallcaps':
      return `
  text-align: center;
  font-variant: small-caps;
  font-weight: 600;
  font-size: 1.5em;
  letter-spacing: 0.08em;
`;
    case 'left-tight':
      return `
  text-align: left;
  font-weight: 700;
  font-size: 1.4em;
  letter-spacing: -0.02em;
`;
    case 'allcaps-huge-number':
      return `
  text-align: left;
  font-weight: 900;
  font-size: 2em;
  letter-spacing: 0.05em;
  text-transform: uppercase;
`;
    case 'colored-bold':
      return `
  text-align: left;
  font-weight: 700;
  font-size: 1.6em;
  color: var(--book-accent);
`;
    case 'right-italic-smallcaps':
      return `
  text-align: right;
  font-style: italic;
  font-variant: small-caps;
  font-weight: 500;
  font-size: 1.3em;
  letter-spacing: 0.05em;
`;
    case 'mono-big':
      return `
  text-align: left;
  font-weight: 600;
  font-size: 1.6em;
  letter-spacing: -0.01em;
`;
    default:
      return '';
  }
}

function renderDropCapCss(
  scope: string,
  fontFamily: string,
  lines: number,
  accentColor: string
): string {
  const size = lines === 3 ? '3.8em' : '2.6em';
  const lineHeight = lines === 3 ? '0.85' : '0.9';
  return `
${scope} .book-body .book-chapter-body > p:first-of-type::first-letter {
  font-family: ${fontFamily};
  color: ${accentColor};
  float: left;
  font-size: ${size};
  line-height: ${lineHeight};
  padding-right: 0.12em;
  padding-top: 0.08em;
  font-weight: 700;
}
`;
}

/** Build a <link> href for Google Fonts loading both body + heading of a theme. */
export function buildBookThemeGoogleFontsUrl(theme: BookThemeSpec): string {
  return `https://fonts.googleapis.com/css2?family=${theme.bodyFontGoogleName}&family=${theme.chapterHeadingFontGoogleName}`;
}

export function isBookThemeId(x: unknown): x is BookThemeId {
  return typeof x === 'string' && x in BOOK_THEMES;
}
