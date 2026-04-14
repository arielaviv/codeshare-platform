import type {
  Slide,
  SlideTheme,
  EditorElement,
  ChartDataPoint,
} from '../../types/deck';
import { resolveTheme, SLIDE_WIDTH, SLIDE_HEIGHT } from './themes';

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`;
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function items(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function chartData(value: unknown): ChartDataPoint[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (p): p is { label: string; value: number } =>
        typeof p === 'object' &&
        p !== null &&
        typeof (p as { label?: unknown }).label === 'string' &&
        typeof (p as { value?: unknown }).value === 'number'
    )
    .map((p) => ({ label: p.label, value: p.value }));
}

export function deriveElements(slide: Slide, theme: SlideTheme): EditorElement[] {
  const t = resolveTheme(theme);
  const content = slide.content as Record<string, unknown>;

  switch (slide.type) {
    case 'title':
      return [
        {
          id: nextId('bg'),
          type: 'shape',
          shape: 'rect',
          x: 0,
          y: SLIDE_HEIGHT - 12,
          w: SLIDE_WIDTH,
          h: 12,
          fill: t.accent,
        },
        {
          id: nextId('t'),
          type: 'text',
          x: 160,
          y: 400,
          w: SLIDE_WIDTH - 320,
          h: 200,
          content: str(content.heading, 'Untitled'),
          fontSize: 88,
          fontWeight: 700,
          align: 'left',
          color: t.text,
        },
        {
          id: nextId('t'),
          type: 'text',
          x: 160,
          y: 620,
          w: SLIDE_WIDTH - 320,
          h: 80,
          content: str(content.subtitle),
          fontSize: 32,
          fontWeight: 400,
          align: 'left',
          color: t.textMuted,
        },
      ];

    case 'bullets': {
      const heading = str(content.heading, 'Key points');
      const bulletItems = items(content.items);
      const els: EditorElement[] = [
        {
          id: nextId('t'),
          type: 'text',
          x: 120,
          y: 100,
          w: SLIDE_WIDTH - 240,
          h: 120,
          content: heading,
          fontSize: 56,
          fontWeight: 700,
          align: 'left',
          color: t.text,
        },
      ];
      bulletItems.forEach((item, i) => {
        els.push({
          id: nextId('sh'),
          type: 'shape',
          shape: 'circle',
          x: 140,
          y: 300 + i * 120 + 24,
          w: 14,
          h: 14,
          fill: t.accent,
        });
        els.push({
          id: nextId('t'),
          type: 'text',
          x: 180,
          y: 300 + i * 120,
          w: SLIDE_WIDTH - 300,
          h: 80,
          content: item,
          fontSize: 36,
          fontWeight: 400,
          align: 'left',
          color: t.text,
        });
      });
      return els;
    }

    case 'two-column': {
      const heading = str(content.heading);
      const left = content.left as { heading?: string; items?: string[] } | undefined;
      const right = content.right as { heading?: string; items?: string[] } | undefined;
      const els: EditorElement[] = [
        {
          id: nextId('t'),
          type: 'text',
          x: 120,
          y: 100,
          w: SLIDE_WIDTH - 240,
          h: 120,
          content: heading,
          fontSize: 56,
          fontWeight: 700,
          align: 'left',
          color: t.text,
        },
      ];
      const COL_W = (SLIDE_WIDTH - 360) / 2;
      const leftX = 120;
      const rightX = 120 + COL_W + 120;
      if (left?.heading) {
        els.push({
          id: nextId('t'),
          type: 'text',
          x: leftX,
          y: 280,
          w: COL_W,
          h: 60,
          content: left.heading,
          fontSize: 32,
          fontWeight: 700,
          align: 'left',
          color: t.accent,
        });
      }
      (left?.items || []).forEach((item, i) => {
        els.push({
          id: nextId('t'),
          type: 'text',
          x: leftX,
          y: 360 + i * 70,
          w: COL_W,
          h: 60,
          content: `• ${item}`,
          fontSize: 26,
          fontWeight: 400,
          align: 'left',
          color: t.text,
        });
      });
      if (right?.heading) {
        els.push({
          id: nextId('t'),
          type: 'text',
          x: rightX,
          y: 280,
          w: COL_W,
          h: 60,
          content: right.heading,
          fontSize: 32,
          fontWeight: 700,
          align: 'left',
          color: t.accent,
        });
      }
      (right?.items || []).forEach((item, i) => {
        els.push({
          id: nextId('t'),
          type: 'text',
          x: rightX,
          y: 360 + i * 70,
          w: COL_W,
          h: 60,
          content: `• ${item}`,
          fontSize: 26,
          fontWeight: 400,
          align: 'left',
          color: t.text,
        });
      });
      return els;
    }

    case 'image':
      return [
        {
          id: nextId('i'),
          type: 'image',
          x: 0,
          y: 0,
          w: SLIDE_WIDTH,
          h: SLIDE_HEIGHT,
          src: str(content.imageUrl, 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=1600&h=900&fit=crop'),
          objectFit: 'cover',
        },
        {
          id: nextId('sh'),
          type: 'shape',
          shape: 'rect',
          x: 0,
          y: SLIDE_HEIGHT - 280,
          w: SLIDE_WIDTH,
          h: 280,
          fill: 'rgba(0,0,0,0.55)',
        },
        {
          id: nextId('t'),
          type: 'text',
          x: 120,
          y: SLIDE_HEIGHT - 240,
          w: SLIDE_WIDTH - 240,
          h: 100,
          content: str(content.heading),
          fontSize: 56,
          fontWeight: 700,
          align: 'left',
          color: '#FFFFFF',
        },
        {
          id: nextId('t'),
          type: 'text',
          x: 120,
          y: SLIDE_HEIGHT - 140,
          w: SLIDE_WIDTH - 240,
          h: 60,
          content: str(content.caption),
          fontSize: 26,
          fontWeight: 400,
          align: 'left',
          color: 'rgba(255,255,255,0.85)',
        },
      ];

    case 'chart-bar':
    case 'chart-line':
    case 'chart-pie': {
      const chartType = slide.type === 'chart-bar' ? 'bar' : slide.type === 'chart-line' ? 'line' : 'pie';
      return [
        {
          id: nextId('t'),
          type: 'text',
          x: 120,
          y: 100,
          w: SLIDE_WIDTH - 240,
          h: 120,
          content: str(content.heading, 'Chart'),
          fontSize: 56,
          fontWeight: 700,
          align: 'left',
          color: t.text,
        },
        {
          id: nextId('c'),
          type: 'chart',
          chartType,
          x: 120,
          y: 260,
          w: SLIDE_WIDTH - 240,
          h: 720,
          data: chartData(content.data),
          accentColor: t.accent,
          xAxisLabel: str(content.xAxisLabel),
          yAxisLabel: str(content.yAxisLabel),
        },
      ];
    }

    case 'stat': {
      return [
        {
          id: nextId('s'),
          type: 'stat',
          x: 160,
          y: 280,
          w: SLIDE_WIDTH - 320,
          h: 520,
          value: str(content.value, '—'),
          label: str(content.label, ''),
          caption: str(content.caption),
          trend:
            content.trend === 'up' || content.trend === 'down' || content.trend === 'neutral'
              ? content.trend
              : undefined,
        },
      ];
    }

    case 'quote': {
      return [
        {
          id: nextId('sh'),
          type: 'shape',
          shape: 'rect',
          x: 160,
          y: 420,
          w: 8,
          h: 240,
          fill: t.accent,
        },
        {
          id: nextId('t'),
          type: 'text',
          x: 220,
          y: 400,
          w: SLIDE_WIDTH - 380,
          h: 200,
          content: `"${str(content.text, '')}"`,
          fontSize: 52,
          fontWeight: 500,
          align: 'left',
          color: t.text,
          italic: true,
        },
        {
          id: nextId('t'),
          type: 'text',
          x: 220,
          y: 620,
          w: SLIDE_WIDTH - 380,
          h: 60,
          content: str(content.author)
            ? `— ${str(content.author)}${str(content.source) ? `, ${str(content.source)}` : ''}`
            : '',
          fontSize: 28,
          fontWeight: 400,
          align: 'left',
          color: t.textMuted,
        },
      ];
    }

    case 'comparison': {
      const heading = str(content.heading);
      const left = content.left as { title?: string; points?: string[] } | undefined;
      const right = content.right as { title?: string; points?: string[] } | undefined;
      const COL_W = (SLIDE_WIDTH - 360) / 2;
      const els: EditorElement[] = [
        {
          id: nextId('t'),
          type: 'text',
          x: 120,
          y: 100,
          w: SLIDE_WIDTH - 240,
          h: 120,
          content: heading,
          fontSize: 56,
          fontWeight: 700,
          align: 'left',
          color: t.text,
        },
      ];
      const cols: Array<{ col: typeof left; xBase: number }> = [
        { col: left, xBase: 120 },
        { col: right, xBase: 120 + COL_W + 120 },
      ];
      cols.forEach(({ col, xBase }) => {
        els.push({
          id: nextId('sh'),
          type: 'shape',
          shape: 'rect',
          x: xBase,
          y: 280,
          w: COL_W,
          h: 720,
          fill: t.backgroundSecondary,
          borderRadius: 16,
        });
        els.push({
          id: nextId('t'),
          type: 'text',
          x: xBase + 40,
          y: 320,
          w: COL_W - 80,
          h: 80,
          content: str(col?.title),
          fontSize: 36,
          fontWeight: 700,
          align: 'left',
          color: t.accent,
        });
        (col?.points || []).forEach((p, i) => {
          els.push({
            id: nextId('t'),
            type: 'text',
            x: xBase + 40,
            y: 420 + i * 80,
            w: COL_W - 80,
            h: 60,
            content: `• ${p}`,
            fontSize: 26,
            fontWeight: 400,
            align: 'left',
            color: t.text,
          });
        });
      });
      return els;
    }

    default:
      return [];
  }
}

export function newElement(
  type: EditorElement['type'],
  theme: SlideTheme
): EditorElement {
  const t = resolveTheme(theme);
  switch (type) {
    case 'text':
      return {
        id: nextId('t'),
        type: 'text',
        x: SLIDE_WIDTH / 2 - 300,
        y: SLIDE_HEIGHT / 2 - 40,
        w: 600,
        h: 80,
        content: 'New text',
        fontSize: 32,
        fontWeight: 400,
        align: 'left',
        color: t.text,
      };
    case 'image':
      return {
        id: nextId('i'),
        type: 'image',
        x: SLIDE_WIDTH / 2 - 300,
        y: SLIDE_HEIGHT / 2 - 200,
        w: 600,
        h: 400,
        src: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=1200&h=800&fit=crop',
        objectFit: 'cover',
      };
    case 'shape':
      return {
        id: nextId('sh'),
        type: 'shape',
        shape: 'rect',
        x: SLIDE_WIDTH / 2 - 150,
        y: SLIDE_HEIGHT / 2 - 100,
        w: 300,
        h: 200,
        fill: t.accent,
      };
    case 'chart':
      return {
        id: nextId('c'),
        type: 'chart',
        chartType: 'bar',
        x: 120,
        y: 260,
        w: SLIDE_WIDTH - 240,
        h: 720,
        data: [
          { label: 'A', value: 30 },
          { label: 'B', value: 50 },
          { label: 'C', value: 20 },
        ],
        accentColor: t.accent,
      };
    case 'stat':
      return {
        id: nextId('s'),
        type: 'stat',
        x: 160,
        y: 280,
        w: SLIDE_WIDTH - 320,
        h: 520,
        value: '42',
        label: 'sample metric',
      };
  }
}

export function duplicateElement(el: EditorElement): EditorElement {
  return {
    ...el,
    id: nextId(el.type.charAt(0)),
    x: el.x + 40,
    y: el.y + 40,
  };
}

export function newBlankSlide(theme: SlideTheme): Slide {
  return {
    id: nextId('slide'),
    type: 'bullets',
    content: { heading: 'New slide', items: [] },
    elements: [
      {
        id: nextId('t'),
        type: 'text',
        x: 120,
        y: 100,
        w: SLIDE_WIDTH - 240,
        h: 120,
        content: 'New slide',
        fontSize: 56,
        fontWeight: 700,
        align: 'left',
        color: resolveTheme(theme).text,
      },
    ],
  };
}
