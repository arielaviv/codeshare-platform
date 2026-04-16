/**
 * Manus-style Personalization / Settings / Usage overlay (images #30–34).
 * Single modal with a left tab sidebar and a right content panel.
 */
import { useEffect, useRef, useState } from 'react';
import api from '../../services/api';
import { usageApi, type UsageRecord } from '../../services/sessionsApi';
import { voicesApi, type VoiceSummary } from '../../services/voicesApi';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { formatUsd } from '../../utils/formatUsd';

interface Props {
  onClose: () => void;
  initialTab?: TabKey;
}

type TabKey = 'account' | 'settings' | 'usage' | 'personalization' | 'data';

const TABS: Array<{ key: TabKey; label: string; icon: JSX.Element }> = [
  { key: 'account', label: 'Account', icon: <PersonIcon /> },
  { key: 'settings', label: 'Settings', icon: <SettingsIcon /> },
  { key: 'usage', label: 'Usage', icon: <SparklesIcon /> },
  { key: 'personalization', label: 'Personalization', icon: <GridIcon /> },
  { key: 'data', label: 'Data controls', icon: <ShieldIcon /> },
];

export default function PersonalizationModal({ onClose, initialTab = 'personalization' }: Props): JSX.Element {
  const [tab, setTab] = useState<TabKey>(initialTab);
  const { user } = useAuth();

  // Esc to close
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-label="Personalization"
    >
      <div className="w-[min(1100px,95vw)] h-[min(780px,90vh)] bg-white dark:bg-[#0F0F0F] rounded-2xl shadow-2xl border border-edge dark:border-[#2A2A2A] overflow-hidden flex">
        {/* Left sidebar */}
        <aside className="w-[240px] flex-shrink-0 border-r border-edge dark:border-[#2A2A2A] bg-surface-secondary dark:bg-[#141414] flex flex-col">
          {/* User pill */}
          <div className="p-4 pb-3 border-b border-edge dark:border-[#2A2A2A] flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-brand-orange text-white text-sm font-bold flex items-center justify-center flex-shrink-0">
              {user?.username?.[0]?.toUpperCase() ?? 'A'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-ink dark:text-[#E8E8E8] truncate">
                {user?.username ?? 'Guest'}
              </div>
              <div className="text-[11px] text-ink-tertiary dark:text-[#666]">Personal</div>
            </div>
          </div>
          {/* Tabs */}
          <nav className="flex-1 overflow-y-auto py-2">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`w-full flex items-center gap-2.5 px-4 py-2 text-sm text-left transition-colors ${
                  tab === t.key
                    ? 'bg-white dark:bg-[#1A1A1A] text-ink dark:text-[#E8E8E8] font-medium'
                    : 'text-ink-secondary dark:text-[#A0A0A0] hover:text-ink dark:hover:text-[#E8E8E8] hover:bg-white dark:hover:bg-[#1A1A1A]'
                }`}
              >
                {t.icon}
                <span>{t.label}</span>
              </button>
            ))}
          </nav>
        </aside>

        {/* Right content pane */}
        <main className="flex-1 overflow-y-auto p-8 relative">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded text-ink-tertiary dark:text-[#666] hover:text-ink dark:hover:text-[#E8E8E8] hover:bg-surface-secondary dark:hover:bg-[#1A1A1A] transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </button>

          {tab === 'account' && <AccountTab onClose={onClose} />}
          {tab === 'settings' && <SettingsTab />}
          {tab === 'usage' && <UsageTab />}
          {tab === 'personalization' && <PersonalizationTab onClose={onClose} />}
          {tab === 'data' && <DataControlsTab />}
        </main>
      </div>
    </div>
  );
}

// -- Tabs --

function AccountTab({ onClose }: { onClose: () => void }): JSX.Element {
  const { user, logout } = useAuth();
  return (
    <div className="max-w-xl">
      <h2 className="text-2xl font-bold text-ink dark:text-[#E8E8E8] mb-1">Account</h2>
      <p className="text-sm text-ink-secondary dark:text-[#A0A0A0] mb-6">
        Your Mr8 account.
      </p>
      <div className="bg-surface-secondary dark:bg-[#141414] border border-edge dark:border-[#2A2A2A] rounded-lg p-5 mb-4">
        <div className="text-[11px] uppercase tracking-wider text-ink-tertiary dark:text-[#666] mb-1">Username</div>
        <div className="text-base text-ink dark:text-[#E8E8E8] mb-4">{user?.username ?? '—'}</div>
        <div className="text-[11px] uppercase tracking-wider text-ink-tertiary dark:text-[#666] mb-1">Email</div>
        <div className="text-base text-ink dark:text-[#E8E8E8]">{user?.email ?? '—'}</div>
      </div>
      <button
        type="button"
        onClick={() => {
          logout();
          onClose();
        }}
        className="text-sm text-status-error hover:underline"
      >
        Sign out
      </button>
    </div>
  );
}

function SettingsTab(): JSX.Element {
  const { dark, toggle } = useTheme();
  return (
    <div className="max-w-xl">
      <h2 className="text-2xl font-bold text-ink dark:text-[#E8E8E8] mb-1">Settings</h2>
      <p className="text-sm text-ink-secondary dark:text-[#A0A0A0] mb-6">
        Appearance and defaults.
      </p>
      <Row label="Theme" hint="Light or dark mode.">
        <button
          type="button"
          onClick={toggle}
          className="px-3 py-1.5 rounded border border-edge dark:border-[#2A2A2A] text-sm text-ink dark:text-[#E8E8E8] hover:bg-surface-secondary dark:hover:bg-[#1A1A1A]"
        >
          {dark ? 'Dark' : 'Light'} mode · click to flip
        </button>
      </Row>
    </div>
  );
}

function UsageTab(): JSX.Element {
  const [data, setData] = useState<{
    balanceCents: number;
    dailyRefreshCents: number;
    records: UsageRecord[];
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    usageApi
      .get()
      .then(setData)
      .catch(() => setData({ balanceCents: 0, dailyRefreshCents: 0, records: [] }))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-3xl">
      <h2 className="text-2xl font-bold text-ink dark:text-[#E8E8E8] mb-1">Usage</h2>

      <div className="bg-surface-secondary dark:bg-[#141414] border border-edge dark:border-[#2A2A2A] rounded-lg p-5 my-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="text-xl font-bold text-ink dark:text-[#E8E8E8]">Free</div>
          </div>
          <button className="px-4 py-1.5 rounded bg-ink dark:bg-white text-white dark:text-ink text-sm font-semibold">
            Upgrade
          </button>
        </div>
        <div className="space-y-3 border-t border-edge dark:border-[#2A2A2A] pt-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-ink dark:text-[#E8E8E8]">
              <SparklesIcon /> <span className="font-medium">Credits</span>
            </div>
            <div className="text-xl font-bold tabular-nums">
              {data ? formatUsd(data.balanceCents) : '—'}
            </div>
          </div>
          {data && data.dailyRefreshCents > 0 && (
            <div className="flex items-center justify-between text-sm text-ink-secondary dark:text-[#A0A0A0]">
              <div>Daily refresh credits</div>
              <div className="tabular-nums">{formatUsd(data.dailyRefreshCents)}</div>
            </div>
          )}
        </div>
      </div>

      <div>
        <div className="text-lg font-semibold text-ink dark:text-[#E8E8E8] mb-3">Usage record</div>
        <div className="grid grid-cols-[1fr_120px_100px] gap-4 px-4 py-2 text-[11px] uppercase tracking-wider text-ink-tertiary dark:text-[#666] border-b border-edge dark:border-[#2A2A2A]">
          <div>Details</div>
          <div>Date</div>
          <div className="text-right">Credits change</div>
        </div>
        {loading && <div className="p-4 text-sm text-ink-tertiary">Loading…</div>}
        {!loading && data?.records.length === 0 && (
          <div className="p-4 text-sm text-ink-tertiary text-center">
            No usage yet. Start a chat to see activity here.
          </div>
        )}
        {data?.records.map((r, i) => (
          <button
            key={i}
            type="button"
            onClick={() => {
              if (r.sessionId) {
                window.open(`/chat?session=${r.sessionId}`, '_blank');
              }
            }}
            disabled={!r.sessionId}
            className="w-full grid grid-cols-[1fr_120px_100px] gap-4 px-4 py-3 text-sm text-left hover:bg-surface-secondary dark:hover:bg-[#1A1A1A] border-b border-edge-light dark:border-[#1A1A1A] disabled:hover:bg-transparent disabled:cursor-default transition-colors"
          >
            <div className="text-ink dark:text-[#E8E8E8] truncate">{r.title}</div>
            <div className="text-ink-tertiary dark:text-[#666] tabular-nums text-xs">
              {new Date(r.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </div>
            <div
              className={`text-right font-semibold tabular-nums ${
                r.creditsChange > 0 ? 'text-brand-green' : 'text-ink dark:text-[#E8E8E8]'
              }`}
            >
              {r.creditsChange > 0 ? '+' : ''}
              {formatUsd(Math.abs(r.creditsChange))}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

interface SoulProfileShape {
  nickname?: string | null;
  occupation?: string | null;
  aboutYou?: string | null;
  customInstructions?: string | null;
  preferences?: {
    defaultVoiceId?: string;
    defaultVoiceName?: string;
  };
}

function PersonalizationTab({ onClose }: { onClose: () => void }): JSX.Element {
  const [subtab, setSubtab] = useState<'profile' | 'voice' | 'knowledge'>('profile');
  const [loaded, setLoaded] = useState(false);
  const [nickname, setNickname] = useState('');
  const [occupation, setOccupation] = useState('');
  const [aboutYou, setAboutYou] = useState('');
  const [customInstructions, setCustomInstructions] = useState('');
  const [voiceId, setVoiceId] = useState<string>('');
  const [voiceName, setVoiceName] = useState<string>('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .get<{ profile: SoulProfileShape | null }>('/soul/me')
      .then((r) => {
        const p = r.data.profile;
        if (p) {
          setNickname(p.nickname ?? '');
          setOccupation(p.occupation ?? '');
          setAboutYou(p.aboutYou ?? '');
          setCustomInstructions(p.customInstructions ?? '');
          setVoiceId(p.preferences?.defaultVoiceId ?? '');
          setVoiceName(p.preferences?.defaultVoiceName ?? '');
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await api.patch('/soul/me', {
        nickname: nickname.trim() || null,
        occupation: occupation.trim() || null,
        aboutYou: aboutYou.trim() || null,
        customInstructions: customInstructions.trim() || null,
        defaultVoiceId: voiceId || null,
        defaultVoiceName: voiceName || null,
      });
      onClose();
    } catch {
      // ignore; toast could go here
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl">
      <h2 className="text-2xl font-bold text-ink dark:text-[#E8E8E8] mb-1">Personalization</h2>
      <p className="text-sm text-ink-secondary dark:text-[#A0A0A0] mb-6">
        Manage who you are and what Mr8 remembers.
      </p>

      <div className="flex items-center gap-6 border-b border-edge dark:border-[#2A2A2A] mb-6">
        <button
          type="button"
          onClick={() => setSubtab('profile')}
          className={`pb-2 text-sm font-medium transition-colors ${
            subtab === 'profile'
              ? 'text-ink dark:text-[#E8E8E8] border-b-2 border-ink dark:border-[#E8E8E8]'
              : 'text-ink-tertiary dark:text-[#666]'
          }`}
        >
          Profile
        </button>
        <button
          type="button"
          onClick={() => setSubtab('voice')}
          className={`pb-2 text-sm font-medium transition-colors ${
            subtab === 'voice'
              ? 'text-ink dark:text-[#E8E8E8] border-b-2 border-ink dark:border-[#E8E8E8]'
              : 'text-ink-tertiary dark:text-[#666]'
          }`}
        >
          Voice
        </button>
        <button
          type="button"
          onClick={() => setSubtab('knowledge')}
          className={`pb-2 text-sm font-medium transition-colors flex items-center gap-1 ${
            subtab === 'knowledge'
              ? 'text-ink dark:text-[#E8E8E8] border-b-2 border-ink dark:border-[#E8E8E8]'
              : 'text-ink-tertiary dark:text-[#666]'
          }`}
        >
          Knowledge
          <span className="text-ink-tertiary dark:text-[#666]" title="Documents Mr8 can reference — coming soon">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </span>
        </button>
      </div>

      {subtab === 'profile' && (
        <>
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-ink dark:text-[#E8E8E8] mb-1.5">Nickname</label>
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                maxLength={60}
                placeholder="What should Mr8 call you?"
                className="w-full px-3 py-2.5 rounded border border-edge dark:border-[#2A2A2A] bg-surface-secondary dark:bg-[#141414] text-ink dark:text-[#E8E8E8] text-sm focus:outline-none focus:border-ink-tertiary dark:focus:border-[#444]"
                disabled={!loaded}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink dark:text-[#E8E8E8] mb-1.5">Occupation</label>
              <input
                type="text"
                value={occupation}
                onChange={(e) => setOccupation(e.target.value)}
                maxLength={80}
                placeholder="e.g., Product Designer, Software Engineer"
                className="w-full px-3 py-2.5 rounded border border-edge dark:border-[#2A2A2A] bg-surface-secondary dark:bg-[#141414] text-ink dark:text-[#E8E8E8] text-sm focus:outline-none focus:border-ink-tertiary dark:focus:border-[#444]"
                disabled={!loaded}
              />
            </div>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-ink dark:text-[#E8E8E8] mb-1.5">More about you</label>
            <div className="relative">
              <textarea
                value={aboutYou}
                onChange={(e) => setAboutYou(e.target.value)}
                maxLength={2000}
                rows={4}
                placeholder="Your background, preferences, or location to help Mr8 understand you better"
                className="w-full px-3 py-2.5 rounded border border-edge dark:border-[#2A2A2A] bg-surface-secondary dark:bg-[#141414] text-ink dark:text-[#E8E8E8] text-sm focus:outline-none focus:border-ink-tertiary dark:focus:border-[#444] resize-none"
                disabled={!loaded}
              />
              <div className="absolute bottom-2 right-3 text-[11px] text-ink-tertiary dark:text-[#666] tabular-nums">
                {aboutYou.length} / 2000
              </div>
            </div>
            <p className="mt-2 text-xs text-ink-tertiary dark:text-[#666]">
              Mr8 uses this information to personalize responses across all tasks.
            </p>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-ink dark:text-[#E8E8E8] mb-1.5">Custom Instructions</label>
            <div className="relative">
              <textarea
                value={customInstructions}
                onChange={(e) => setCustomInstructions(e.target.value)}
                maxLength={3000}
                rows={5}
                placeholder={`How would you like Mr8 to respond?\ne.g., "Focus on Python best practices", "Maintain a professional tone", or "Always provide sources for important conclusions".`}
                className="w-full px-3 py-2.5 rounded border border-edge dark:border-[#2A2A2A] bg-surface-secondary dark:bg-[#141414] text-ink dark:text-[#E8E8E8] text-sm focus:outline-none focus:border-ink-tertiary dark:focus:border-[#444] resize-none"
                disabled={!loaded}
              />
              <div className="absolute bottom-2 right-3 text-[11px] text-ink-tertiary dark:text-[#666] tabular-nums">
                {customInstructions.length} / 3000
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-ink-secondary dark:text-[#A0A0A0] hover:text-ink dark:hover:text-[#E8E8E8]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving || !loaded}
              className="px-4 py-2 rounded bg-ink dark:bg-white text-white dark:text-ink text-sm font-semibold hover:opacity-90 disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </>
      )}

      {subtab === 'voice' && (
        <VoiceSubtab
          voiceId={voiceId}
          onPick={(v) => {
            setVoiceId(v.voiceId);
            setVoiceName(v.name);
          }}
          onClear={() => {
            setVoiceId('');
            setVoiceName('');
          }}
          onClose={onClose}
          onSave={save}
          saving={saving}
          loaded={loaded}
        />
      )}

      {subtab === 'knowledge' && (
        <div className="text-sm text-ink-tertiary dark:text-[#666] py-6">
          Knowledge files — upload docs Mr8 can reference across chats. Coming soon.
        </div>
      )}
    </div>
  );
}

interface VoiceSubtabProps {
  voiceId: string;
  onPick: (v: VoiceSummary) => void;
  onClear: () => void;
  onClose: () => void;
  onSave: () => void;
  saving: boolean;
  loaded: boolean;
}

function VoiceSubtab({ voiceId, onPick, onClear, onClose, onSave, saving, loaded }: VoiceSubtabProps): JSX.Element {
  const [voices, setVoices] = useState<VoiceSummary[] | null>(null);
  const [loadingVoices, setLoadingVoices] = useState(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);

  useEffect(() => {
    setLoadingVoices(true);
    voicesApi
      .list()
      .then((r) => setVoices(r.voices))
      .catch(() => setVoices([]))
      .finally(() => setLoadingVoices(false));
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  const playPreview = (v: VoiceSummary) => {
    if (!v.previewUrl) return;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (playingId === v.voiceId) {
      setPlayingId(null);
      return;
    }
    const audio = new Audio(v.previewUrl);
    audio.onended = () => setPlayingId(null);
    audio.onerror = () => setPlayingId(null);
    void audio.play().then(() => setPlayingId(v.voiceId)).catch(() => setPlayingId(null));
    audioRef.current = audio;
  };

  return (
    <div>
      <p className="text-sm text-ink-secondary dark:text-[#A0A0A0] mb-4">
        Choose the default voice Mr8 uses when generating audio.
      </p>

      {loadingVoices && (
        <div className="text-sm text-ink-tertiary dark:text-[#666] py-4">Loading voices…</div>
      )}

      {!loadingVoices && voices && voices.length === 0 && (
        <div className="text-sm text-ink-tertiary dark:text-[#666] py-4">
          No voices available. Add ELEVENLABS_API_KEY to the backend env to fetch them.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 mb-6">
        {voices?.map((v) => {
          const selected = voiceId === v.voiceId;
          const isPlaying = playingId === v.voiceId;
          return (
            <button
              key={v.voiceId}
              type="button"
              onClick={() => onPick(v)}
              className={`relative text-left rounded-lg border p-3 transition-colors ${
                selected
                  ? 'border-brand-orange bg-brand-orange-soft dark:bg-brand-orange/15'
                  : 'border-edge dark:border-[#2A2A2A] hover:border-ink-tertiary dark:hover:border-[#444] bg-surface-secondary dark:bg-[#141414]'
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="text-sm font-semibold text-ink dark:text-[#E8E8E8] truncate">
                  {v.name}
                </div>
                {v.previewUrl && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      playPreview(v);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        e.stopPropagation();
                        playPreview(v);
                      }
                    }}
                    className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full bg-ink dark:bg-white text-white dark:text-ink hover:opacity-90 cursor-pointer"
                    aria-label={isPlaying ? 'Stop preview' : 'Play preview'}
                  >
                    {isPlaying ? (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                        <rect x="6" y="5" width="4" height="14" />
                        <rect x="14" y="5" width="4" height="14" />
                      </svg>
                    ) : (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                        <polygon points="6,4 20,12 6,20" />
                      </svg>
                    )}
                  </span>
                )}
              </div>
              <div className="text-[11px] text-ink-tertiary dark:text-[#666] line-clamp-1">
                {[v.labels?.gender, v.labels?.accent, v.labels?.description].filter(Boolean).join(' · ') || v.category}
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onClear}
          disabled={!voiceId}
          className="text-sm text-ink-tertiary dark:text-[#666] hover:text-ink dark:hover:text-[#E8E8E8] disabled:opacity-40 disabled:hover:text-ink-tertiary"
        >
          Clear (use default)
        </button>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-ink-secondary dark:text-[#A0A0A0] hover:text-ink dark:hover:text-[#E8E8E8]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving || !loaded}
            className="px-4 py-2 rounded bg-ink dark:bg-white text-white dark:text-ink text-sm font-semibold hover:opacity-90 disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

function DataControlsTab(): JSX.Element {
  return (
    <div className="max-w-xl">
      <h2 className="text-2xl font-bold text-ink dark:text-[#E8E8E8] mb-1">Data controls</h2>
      <p className="text-sm text-ink-secondary dark:text-[#A0A0A0] mb-6">
        Manage your Mr8 data.
      </p>
      <div className="space-y-3">
        <Row label="Clear chat history" hint="Permanently delete all your chats and sessions.">
          <button className="px-3 py-1.5 rounded border border-status-error/40 text-status-error text-sm hover:bg-status-error/10">
            Clear
          </button>
        </Row>
        <Row label="Export my data" hint="Download a JSON archive of your profile and sessions.">
          <button className="px-3 py-1.5 rounded border border-edge dark:border-[#2A2A2A] text-sm text-ink dark:text-[#E8E8E8] hover:bg-surface-secondary dark:hover:bg-[#1A1A1A]">
            Export
          </button>
        </Row>
      </div>
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-edge dark:border-[#1A1A1A]">
      <div>
        <div className="text-sm font-medium text-ink dark:text-[#E8E8E8]">{label}</div>
        {hint && <div className="text-xs text-ink-tertiary dark:text-[#666] mt-0.5">{hint}</div>}
      </div>
      <div>{children}</div>
    </div>
  );
}

// --- Icons (inline SVG, no dep) ---
function PersonIcon(): JSX.Element {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>;
}
function SettingsIcon(): JSX.Element {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="6" x2="20" y2="6" /><line x1="4" y1="12" x2="14" y2="12" /><line x1="4" y1="18" x2="18" y2="18" /><circle cx="18" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="16" cy="18" r="2" /></svg>;
}
function SparklesIcon(): JSX.Element {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5z" /><path d="M19 13l1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2z" /><path d="M5 16l1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2z" /></svg>;
}
function GridIcon(): JSX.Element {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg>;
}
function ShieldIcon(): JSX.Element {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>;
}
