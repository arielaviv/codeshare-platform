/**
 * Mr8 AI Chat Widget — drop into any React + Tailwind app.
 * Three placeholders get replaced on injection:
 *   MR8_WIDGET_ID, MR8_WIDGET_JWT, MR8_PROXY_URL.
 * Respects the host app's theme via CSS vars (--primary, --background,
 * --border, --card-foreground, --radius), so it blends on dark/light.
 */
import { useEffect, useRef, useState } from 'react';

const WIDGET_ID = 'MR8_WIDGET_ID';
const WIDGET_JWT = 'MR8_WIDGET_JWT';
const PROXY_URL = 'MR8_PROXY_URL';

type Msg = { role: 'user' | 'assistant'; content: string };

export function Mr8ChatWidget(): JSX.Element {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, streaming]);

  const send = async () => {
    const trimmed = input.trim();
    if (!trimmed || streaming) return;
    const next: Msg[] = [...messages, { role: 'user', content: trimmed }];
    setMessages(next);
    setInput('');
    setStreaming(true);
    setError(null);

    let response: Response;
    try {
      response = await fetch(PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jwt: WIDGET_JWT, messages: next }),
      });
    } catch (err) {
      setError('Could not reach chat service.');
      setStreaming(false);
      return;
    }

    if (response.status === 429) {
      const body = await response.json().catch(() => ({ message: 'Try again in a bit.' }));
      setError(body.message);
      setStreaming(false);
      return;
    }
    if (!response.ok || !response.body) {
      setError('Chat failed.');
      setStreaming(false);
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let pending = '';
    // Append an empty assistant message we'll stream into.
    setMessages((m) => [...m, { role: 'assistant', content: '' }]);

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop() || '';
      for (const part of parts) {
        const lines = part.split('\n');
        let event = '';
        let data = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) event = line.slice(7);
          else if (line.startsWith('data: ')) data = line.slice(6);
        }
        if (!event || !data) continue;
        try {
          const parsed = JSON.parse(data);
          if (event === 'delta' && typeof parsed.text === 'string') {
            pending += parsed.text;
            setMessages((m) => {
              const copy = m.slice();
              copy[copy.length - 1] = {
                role: 'assistant',
                content: pending,
              };
              return copy;
            });
          } else if (event === 'error') {
            setError(parsed.message ?? 'Chat error');
          }
        } catch {
          /* ignore */
        }
      }
    }
    setStreaming(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Close chat' : 'Open chat'}
        style={{
          position: 'fixed',
          right: 20,
          bottom: 20,
          width: 54,
          height: 54,
          borderRadius: 9999,
          background: 'rgb(var(--primary) / 1)',
          color: 'rgb(var(--primary-foreground) / 1)',
          border: 'none',
          boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
          cursor: 'pointer',
          fontSize: 22,
          zIndex: 2147483000,
        }}
      >
        {open ? '×' : '⌯'}
      </button>
      {open && (
        <div
          style={{
            position: 'fixed',
            right: 20,
            bottom: 88,
            width: 380,
            maxWidth: 'calc(100vw - 40px)',
            height: 560,
            maxHeight: 'calc(100vh - 120px)',
            background: 'rgb(var(--card, var(--background, 20 20 20)) / 1)',
            color: 'rgb(var(--card-foreground, var(--foreground, 245 245 245)) / 1)',
            border: '1px solid rgb(var(--border, 36 36 36) / 1)',
            borderRadius: 16,
            boxShadow: '0 16px 40px rgba(0,0,0,0.35)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            zIndex: 2147483000,
            fontFamily: 'var(--font-sans, system-ui, sans-serif)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 14px',
              borderBottom: '1px solid rgb(var(--border, 36 36 36) / 1)',
              fontWeight: 600,
            }}
          >
            <span>Assistant</span>
            <button
              type="button"
              onClick={() => {
                setMessages([]);
                setError(null);
              }}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'rgb(var(--muted-foreground, 140 140 140) / 1)',
                cursor: 'pointer',
                fontSize: 12,
              }}
            >
              Reset
            </button>
          </div>
          <div
            ref={listRef}
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: 12,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              fontSize: 14,
              lineHeight: 1.5,
            }}
          >
            {messages.length === 0 && (
              <div style={{ opacity: 0.6, fontSize: 13 }}>
                Ask me anything about this site.
              </div>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                style={{
                  alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '82%',
                  padding: '8px 12px',
                  borderRadius: 12,
                  background:
                    m.role === 'user'
                      ? 'rgb(var(--primary, 220 40 40) / 1)'
                      : 'rgb(var(--secondary, 31 31 31) / 1)',
                  color:
                    m.role === 'user'
                      ? 'rgb(var(--primary-foreground, 255 255 255) / 1)'
                      : 'rgb(var(--secondary-foreground, 245 245 245) / 1)',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {m.content}
              </div>
            ))}
            {error && (
              <div style={{ fontSize: 12, color: 'rgb(var(--destructive, 239 68 68) / 1)' }}>
                {error}
              </div>
            )}
          </div>
          <div
            style={{
              padding: 10,
              borderTop: '1px solid rgb(var(--border, 36 36 36) / 1)',
              display: 'flex',
              gap: 6,
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              placeholder="Message…"
              disabled={streaming}
              style={{
                flex: 1,
                padding: '8px 10px',
                borderRadius: 8,
                border: '1px solid rgb(var(--border, 36 36 36) / 1)',
                background: 'rgb(var(--input, 36 36 36) / 1)',
                color: 'inherit',
                fontSize: 14,
              }}
            />
            <button
              type="button"
              onClick={() => void send()}
              disabled={streaming || !input.trim()}
              style={{
                padding: '8px 14px',
                borderRadius: 8,
                border: 'none',
                background: 'rgb(var(--primary, 220 40 40) / 1)',
                color: 'rgb(var(--primary-foreground, 255 255 255) / 1)',
                fontWeight: 600,
                cursor: streaming ? 'wait' : 'pointer',
                opacity: streaming || !input.trim() ? 0.6 : 1,
              }}
            >
              Send
            </button>
          </div>
          <div
            style={{
              padding: '6px 12px',
              fontSize: 10,
              textAlign: 'center',
              color: 'rgb(var(--muted-foreground, 140 140 140) / 1)',
              borderTop: '1px solid rgb(var(--border, 36 36 36) / 1)',
            }}
          >
            Powered by Mr8
          </div>
        </div>
      )}
    </>
  );
}

export default Mr8ChatWidget;
