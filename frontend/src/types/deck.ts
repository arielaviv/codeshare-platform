export type SlidePalette = 'dark' | 'light' | 'gartner-blue' | 'gartner-warm';

export type SlideType =
  | 'title'
  | 'bullets'
  | 'two-column'
  | 'image'
  | 'chart-bar'
  | 'chart-line'
  | 'chart-pie'
  | 'stat'
  | 'quote'
  | 'comparison';

export interface SlideTheme {
  palette: SlidePalette;
  accentColor: string;
  fontFamily: string;
}

// AI-generated slide content — shape varies by type
export type SlideContent = Record<string, unknown>;

// --- Canvas editor element types (for manual overrides) ---

export interface BaseElement {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z?: number;
}

export interface TextElement extends BaseElement {
  type: 'text';
  content: string;
  fontSize: number;
  fontWeight: number;
  align: 'left' | 'center' | 'right';
  color: string;
  italic?: boolean;
  underline?: boolean;
}

export interface ImageElement extends BaseElement {
  type: 'image';
  src: string;
  objectFit: 'cover' | 'contain';
  alt?: string;
}

export interface ShapeElement extends BaseElement {
  type: 'shape';
  shape: 'rect' | 'circle' | 'line';
  fill: string;
  stroke?: string;
  strokeWidth?: number;
  borderRadius?: number;
}

export interface ChartDataPoint {
  label: string;
  value: number;
}

export interface ChartElement extends BaseElement {
  type: 'chart';
  chartType: 'bar' | 'line' | 'pie';
  data: ChartDataPoint[];
  accentColor?: string;
  xAxisLabel?: string;
  yAxisLabel?: string;
}

export interface StatElement extends BaseElement {
  type: 'stat';
  value: string;
  label: string;
  caption?: string;
  trend?: 'up' | 'down' | 'neutral';
}

export type EditorElement =
  | TextElement
  | ImageElement
  | ShapeElement
  | ChartElement
  | StatElement;

export interface Slide {
  id: string;
  type: SlideType;
  content: SlideContent;
  elements?: EditorElement[];
  notes?: string;
}

export interface DeckSummary {
  _id: string;
  userId: string;
  title: string;
  description?: string;
  theme: SlideTheme;
  isPublic: boolean;
  thumbnail?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Deck extends DeckSummary {
  slides: Slide[];
}

export interface DeckListResponse {
  decks: DeckSummary[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
    hasMore: boolean;
  };
}

export interface DeckDetailResponse {
  deck: Deck;
  isOwner: boolean;
}

export interface GenerateDeckRequest {
  topic: string;
  slideCount: number;
  style?: 'professional' | 'casual' | 'academic';
  templateId?: string;
  researchBrief?: ResearchBrief;
}

export type UserIntent = 'deck' | 'code-app' | 'code-explain' | 'computer';

export interface ClassifyIntentResponse {
  intent: UserIntent;
  confidence: number;
  needsResearch: boolean;
  researchQuery?: string;
}

export interface ResearchSource {
  url: string;
  title: string;
  snippet: string;
  relevance: number;
}

export interface ResearchBrief {
  query: string;
  summary: string;
  keyFacts: string[];
  sources: ResearchSource[];
  durationMs: number;
  cappedAt?: 'actions' | 'time';
}
