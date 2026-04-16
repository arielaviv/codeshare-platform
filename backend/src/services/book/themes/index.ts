/**
 * Book Themes — the 6 curated typographic systems Mr8 books ship in.
 *
 * Each theme is a complete system (cover title treatment + interior body +
 * chapter heading + drop cap + scene break + trim size + margins). The AI
 * auto-picks one at outline-complete based on genre/tone; the user can
 * override via the Studio's Theme dropdown. The selected theme drives:
 *
 *   1. Cover canvas typography (title + author composite).
 *   2. Chapter reader typography in the Studio panel.
 *   3. Pandoc LaTeX template + EPUB CSS at format time (Slice 7).
 *
 * All 6 themes use Google Fonts — free, well-licensed, production-grade
 * for book work.
 *
 * Keep this file in sync with frontend/src/themes/book/index.ts. The two
 * copies are identical except the frontend one also exports CSS strings.
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
  /** One-line pitch shown in the Theme dropdown. */
  tagline: string;
  /** Genres this theme fits best — used by AI auto-pick. */
  idealFor: string[];

  /** Cover typography (the ONE cover the user selected; picker has its own per-variant treatments). */
  coverTitleTreatment: TitleTreatment;

  /** Interior typography. All fonts must be Google Fonts. */
  bodyFontFamily: string;      // CSS font-family stack
  bodyFontGoogleName: string;  // Google Fonts URL param, e.g. "EB+Garamond:wght@400;700&display=swap"
  chapterHeadingFontFamily: string;
  chapterHeadingFontGoogleName: string;

  /** Body rendering. */
  bodyFontSizePt: number;        // printed point size; CSS maps to em relative to base
  bodyLeadingPt: number;         // line-height in pt (body size × 1.3–1.5 typically)
  firstLineIndentEm: number;     // 1em first-line indent (0 = no indent)

  /** Chapter opener. */
  chapterOpenerStyle:
    | 'centered-smallcaps'
    | 'left-tight'
    | 'allcaps-huge-number'
    | 'colored-bold'
    | 'right-italic-smallcaps'
    | 'mono-big';
  /** Raised drop cap on first letter of first paragraph. */
  dropCapEnabled: boolean;
  /** Drop cap height in lines (3 = 3-line raised). */
  dropCapLines: number;

  /** Between-scene breaks. */
  sceneBreakOrnament: string;    // e.g. "⋯", "❖", "——", "★", "·  ·  ·"

  /** Physical book specs (KDP). */
  trimSize: TrimSize;
  marginTopIn: number;
  marginBottomIn: number;
  marginInnerIn: number;         // gutter side (spine)
  marginOuterIn: number;

  /** Running head / page number conventions. */
  runningHeadStyle: 'title-author' | 'author-chapter' | 'none';
  pageNumberPosition: 'footer-center' | 'footer-outer' | 'none';

  /** Swatch colors shown in the Theme dropdown. */
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
    firstLineIndentEm: 0, // no indent — children's books read better block-style
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
    firstLineIndentEm: 0, // no indent — non-fiction reads better block-style
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

export function isBookThemeId(x: unknown): x is BookThemeId {
  return typeof x === 'string' && x in BOOK_THEMES;
}

/**
 * AI auto-pick: given the outline's declared genre/tone, choose a theme.
 * Deterministic — same inputs always return the same theme id.
 * The Planner / Outliner calls this post-outline (no LLM needed).
 */
export function pickThemeForOutline(input: { genre?: string; tone?: string }): BookThemeId {
  const g = (input.genre ?? '').toLowerCase();
  const t = (input.tone ?? '').toLowerCase();

  if (g.includes("children") || g.includes('middle grade') || g.includes('picture book')) {
    return 'children-warm';
  }
  if (g.includes('memoir') || g.includes('biography') || g.includes('letters') || g.includes('nature')) {
    return 'memoir-warm';
  }
  if (
    g.includes('thriller') ||
    g.includes('crime') ||
    g.includes('mystery') ||
    g.includes('suspense') ||
    g.includes('horror')
  ) {
    return 'thriller-tight';
  }
  if (
    g.includes('how-to') ||
    g.includes('guide') ||
    g.includes('business') ||
    g.includes('self-help') ||
    g.includes('tech') ||
    g.includes('non-fiction') ||
    g.includes('nonfiction')
  ) {
    return 'nonfiction-clean';
  }
  if (
    g.includes('contemporary') ||
    g.includes('short stories') ||
    t.includes('tight') ||
    t.includes('propulsive')
  ) {
    return 'literary-modern';
  }
  // Default — literary classic reads well for anything unclassified.
  return 'literary-classic';
}
