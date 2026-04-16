/**
 * Base44-style right-side theme editor. Reads the current theme from
 * the generated app's src/index.css, lets the user tweak ~30 shadcn
 * tokens + fonts, and writes the change back through
 * wcManager.updateFiles so Vite HMR reflects it live.
 */
import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { wcManager } from '../../lib/webcontainer-manager';
import {
  DEFAULT_THEME,
  FONT_OPTIONS,
  THEME_TOKENS,
  applyFontLinkToHtml,
  findFontByStack,
  parseThemeFromCss,
  serializeThemeToCss,
  type Theme,
  type ThemeToken,
} from '../../lib/theme-serializer';
import { Tooltip } from '../ui/Tooltip';

interface Props {
  onClose: () => void;
}

function humanize(token: ThemeToken): string {
  return token
    .split('-')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ');
}

export function ThemeEditor({ onClose }: Props): JSX.Element {
  const [theme, setTheme] = useState<Theme>(DEFAULT_THEME);
  const [initialCss, setInitialCss] = useState<string>('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const css = wcManager.getFiles().get('src/index.css') ?? '';
    setInitialCss(css);
    const parsed = parseThemeFromCss(css);
    setTheme({
      colors: { ...DEFAULT_THEME.colors, ...parsed.colors },
      fontSans: parsed.fontSans,
      fontDisplay: parsed.fontDisplay,
    });
  }, []);

  const sampleStyle = useMemo(
    () => ({
      backgroundColor: theme.colors.background ?? '#0A0A0A',
      color: theme.colors.primary ?? '#DC2828',
      fontFamily: theme.fontDisplay,
    }),
    [theme.colors.background, theme.colors.primary, theme.fontDisplay]
  );

  const setColor = (token: ThemeToken, hex: string) => {
    setTheme((t) => ({ ...t, colors: { ...t.colors, [token]: hex } }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const files = wcManager.getFiles();
      // Write the new CSS.
      const currentCss = files.get('src/index.css') ?? initialCss;
      files.set('src/index.css', serializeThemeToCss(theme, currentCss));
      // Write the font <link>s into index.html.
      const html = files.get('index.html');
      if (html) {
        const fonts = [theme.fontSans, theme.fontDisplay]
          .map((stack) => findFontByStack(stack).url)
          .filter((u, i, a) => a.indexOf(u) === i);
        files.set('index.html', applyFontLinkToHtml(html, fonts));
      }
      await wcManager.updateFiles(files);
      onClose();
    } catch (err) {
      console.error('theme save failed', err);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    onClose();
  };

  return (
    <div
      className="flex h-full flex-col bg-white dark:bg-[#0F0F0F] text-ink dark:text-[#E8E8E8]"
      style={{ width: 360 }}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-edge dark:border-[#2A2A2A] flex-shrink-0">
        <div>
          <div className="text-sm font-semibold">Theme</div>
          <div className="text-[11px] text-ink-tertiary dark:text-[#666] max-w-[260px]">
            Colors and fonts for the generated app. Changes apply everywhere.
          </div>
        </div>
        <Tooltip content="Close" side="bottom">
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-ink-tertiary dark:text-[#666] hover:text-ink dark:hover:text-[#E8E8E8]"
            aria-label="Close theme editor"
          >
            <X size={16} />
          </button>
        </Tooltip>
      </div>

      <div
        className="rounded-md mx-4 mt-3 flex items-center justify-center py-10 border border-edge dark:border-[#2A2A2A]"
        style={sampleStyle}
      >
        <span className="text-5xl font-black tracking-tight">AaBb</span>
      </div>

      <div className="px-4 py-3 border-b border-edge dark:border-[#2A2A2A] flex-shrink-0">
        <div className="text-[11px] uppercase tracking-wider text-ink-tertiary dark:text-[#666] mb-2">
          Fonts
        </div>
        <label className="block text-[11px] mb-1">Body</label>
        <select
          value={findFontByStack(theme.fontSans).name}
          onChange={(e) => {
            const picked = FONT_OPTIONS.find((f) => f.name === e.target.value);
            if (picked) setTheme((t) => ({ ...t, fontSans: picked.stack }));
          }}
          className="w-full mb-2 px-2 py-1.5 text-sm rounded border border-edge dark:border-[#2A2A2A] bg-white dark:bg-[#141414]"
        >
          {FONT_OPTIONS.map((f) => (
            <option key={f.name} value={f.name}>{f.name}</option>
          ))}
        </select>
        <label className="block text-[11px] mb-1">Display</label>
        <select
          value={findFontByStack(theme.fontDisplay).name}
          onChange={(e) => {
            const picked = FONT_OPTIONS.find((f) => f.name === e.target.value);
            if (picked) setTheme((t) => ({ ...t, fontDisplay: picked.stack }));
          }}
          className="w-full px-2 py-1.5 text-sm rounded border border-edge dark:border-[#2A2A2A] bg-white dark:bg-[#141414]"
        >
          {FONT_OPTIONS.map((f) => (
            <option key={f.name} value={f.name}>{f.name}</option>
          ))}
        </select>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
        <div className="text-[11px] uppercase tracking-wider text-ink-tertiary dark:text-[#666] mb-2">
          Colors
        </div>
        {THEME_TOKENS.map((token) => {
          const value = theme.colors[token] ?? DEFAULT_THEME.colors[token] ?? '#000000';
          return (
            <div key={token} className="flex items-center gap-3 py-1.5">
              <span className="flex-1 text-[13px]">{humanize(token)}</span>
              <input
                type="text"
                value={value}
                onChange={(e) => setColor(token, e.target.value)}
                className="w-[84px] px-1.5 py-0.5 text-[11px] font-mono rounded border border-edge dark:border-[#2A2A2A] bg-white dark:bg-[#141414]"
              />
              <label className="relative w-6 h-6 rounded border border-edge dark:border-[#2A2A2A] overflow-hidden cursor-pointer" style={{ backgroundColor: value }}>
                <input
                  type="color"
                  value={value}
                  onChange={(e) => setColor(token, e.target.value)}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
              </label>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-edge dark:border-[#2A2A2A] flex-shrink-0">
        <button
          type="button"
          onClick={handleCancel}
          className="px-3 py-1.5 text-sm rounded border border-edge dark:border-[#2A2A2A] text-ink-secondary dark:text-[#A0A0A0] hover:text-ink dark:hover:text-[#E8E8E8]"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-3 py-1.5 text-sm rounded bg-brand-orange text-white font-medium disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save & Apply'}
        </button>
      </div>
    </div>
  );
}
