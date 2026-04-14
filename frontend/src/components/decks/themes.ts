import type { SlidePalette, SlideTheme } from '../../types/deck';

export interface ThemeColors {
  background: string;
  backgroundSecondary: string;
  text: string;
  textMuted: string;
  accent: string;
  accentFg: string;
  divider: string;
}

export function resolveTheme(theme: SlideTheme): ThemeColors {
  const accent = theme.accentColor;

  switch (theme.palette) {
    case 'dark':
      return {
        background: '#0A0A0A',
        backgroundSecondary: '#171717',
        text: '#F5F5F5',
        textMuted: '#A3A3A3',
        accent,
        accentFg: '#FFFFFF',
        divider: '#2A2A2A',
      };
    case 'light':
      return {
        background: '#FFFFFF',
        backgroundSecondary: '#F7F7F7',
        text: '#111111',
        textMuted: '#525252',
        accent,
        accentFg: '#FFFFFF',
        divider: '#E5E5E5',
      };
    case 'gartner-blue':
      return {
        background: '#FFFFFF',
        backgroundSecondary: '#F3F5FA',
        text: '#0B1F4A',
        textMuted: '#4A5A7A',
        accent,
        accentFg: '#FFFFFF',
        divider: '#D9DFEB',
      };
    case 'gartner-warm':
      return {
        background: '#FBF4E4',
        backgroundSecondary: '#F2E6C9',
        text: '#3A2B17',
        textMuted: '#7A6443',
        accent,
        accentFg: '#FFFFFF',
        divider: '#D9C9A1',
      };
  }
}

export const DEFAULT_THEMES: Record<SlidePalette, SlideTheme> = {
  dark: {
    palette: 'dark',
    accentColor: '#FFFFFF',
    fontFamily: 'Inter, system-ui, sans-serif',
  },
  light: {
    palette: 'light',
    accentColor: '#2563EB',
    fontFamily: 'Inter, system-ui, sans-serif',
  },
  'gartner-blue': {
    palette: 'gartner-blue',
    accentColor: '#002060',
    fontFamily: 'Inter, system-ui, sans-serif',
  },
  'gartner-warm': {
    palette: 'gartner-warm',
    accentColor: '#8B4513',
    fontFamily: 'Inter, system-ui, sans-serif',
  },
};

export const SLIDE_WIDTH = 1920;
export const SLIDE_HEIGHT = 1080;
