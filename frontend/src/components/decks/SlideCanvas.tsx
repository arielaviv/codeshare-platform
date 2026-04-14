import { useCallback, useEffect, useRef, useState } from 'react';
import type { Slide, SlideTheme, EditorElement } from '../../types/deck';
import { resolveTheme, SLIDE_WIDTH, SLIDE_HEIGHT } from './themes';
import TextElement from './elements/TextElement';
import ImageElement from './elements/ImageElement';
import ShapeElement from './elements/ShapeElement';
import ChartElement from './elements/ChartElement';
import StatElement from './elements/StatElement';

interface Props {
  slide: Slide;
  theme: SlideTheme;
  selectedId: string | null;
  editingTextId: string | null;
  interactive?: boolean;
  onSelect: (id: string | null) => void;
  onEnterEditText: (id: string) => void;
  onExitEditText: () => void;
  onChange: (updater: (elements: EditorElement[]) => EditorElement[]) => void;
  onDeleteSelected: () => void;
  onDuplicateSelected: () => void;
}

type ResizeDir = 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'w' | 'e';

interface DragState {
  kind: 'move' | 'resize';
  dir?: ResizeDir;
  elementId: string;
  startScreenX: number;
  startScreenY: number;
  initial: { x: number; y: number; w: number; h: number };
}

const HANDLE_SIZE = 10;
const MIN_SIZE = 24;

function ElementRenderer({
  element,
  editingTextId,
  accentColor,
  textColor,
  textMuted,
  onCommitText,
  onExitEdit,
}: {
  element: EditorElement;
  editingTextId: string | null;
  accentColor: string;
  textColor: string;
  textMuted: string;
  onCommitText: (id: string, content: string) => void;
  onExitEdit: () => void;
}) {
  switch (element.type) {
    case 'text':
      return (
        <TextElement
          element={element}
          editing={editingTextId === element.id}
          onCommit={(content) => onCommitText(element.id, content)}
          onExitEdit={onExitEdit}
        />
      );
    case 'image':
      return <ImageElement element={element} />;
    case 'shape':
      return <ShapeElement element={element} />;
    case 'chart':
      return <ChartElement element={element} />;
    case 'stat':
      return (
        <StatElement
          element={element}
          accentColor={accentColor}
          textColor={textColor}
          textMuted={textMuted}
        />
      );
  }
}

export default function SlideCanvas({
  slide,
  theme,
  selectedId,
  editingTextId,
  interactive = true,
  onSelect,
  onEnterEditText,
  onExitEditText,
  onChange,
  onDeleteSelected,
  onDuplicateSelected,
}: Props) {
  const colors = resolveTheme(theme);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [wrapWidth, setWrapWidth] = useState(800);
  const [drag, setDrag] = useState<DragState | null>(null);

  // Observe container size for responsive scaling
  useEffect(() => {
    if (!wrapRef.current) return;
    const el = wrapRef.current;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setWrapWidth(entry.contentRect.width);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const scale = wrapWidth / SLIDE_WIDTH;
  const wrapHeight = SLIDE_HEIGHT * scale;
  const elements = slide.elements || [];

  const commitText = useCallback(
    (id: string, content: string) => {
      onChange((els) =>
        els.map((el) => (el.id === id && el.type === 'text' ? { ...el, content } : el))
      );
    },
    [onChange]
  );

  // Keyboard shortcuts when selected
  useEffect(() => {
    if (!interactive) return;
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      if (!selectedId) return;
      const shift = e.shiftKey;
      const step = shift ? 10 : 1;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        onDeleteSelected();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        onChange((els) => els.map((el) => (el.id === selectedId ? { ...el, y: el.y - step } : el)));
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        onChange((els) => els.map((el) => (el.id === selectedId ? { ...el, y: el.y + step } : el)));
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        onChange((els) => els.map((el) => (el.id === selectedId ? { ...el, x: el.x - step } : el)));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        onChange((els) => els.map((el) => (el.id === selectedId ? { ...el, x: el.x + step } : el)));
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        onDuplicateSelected();
      } else if (e.key === 'Escape') {
        onSelect(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [interactive, selectedId, onChange, onDeleteSelected, onDuplicateSelected, onSelect]);

  // Global drag tracking
  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      const dx = (e.clientX - drag.startScreenX) / scale;
      const dy = (e.clientY - drag.startScreenY) / scale;
      onChange((els) =>
        els.map((el) => {
          if (el.id !== drag.elementId) return el;
          if (drag.kind === 'move') {
            return { ...el, x: drag.initial.x + dx, y: drag.initial.y + dy };
          }
          // resize
          let { x, y, w, h } = drag.initial;
          const dir = drag.dir!;
          if (dir.includes('e')) w = Math.max(MIN_SIZE, drag.initial.w + dx);
          if (dir.includes('s')) h = Math.max(MIN_SIZE, drag.initial.h + dy);
          if (dir.includes('w')) {
            const newW = Math.max(MIN_SIZE, drag.initial.w - dx);
            x = drag.initial.x + (drag.initial.w - newW);
            w = newW;
          }
          if (dir.includes('n')) {
            const newH = Math.max(MIN_SIZE, drag.initial.h - dy);
            y = drag.initial.y + (drag.initial.h - newH);
            h = newH;
          }
          return { ...el, x, y, w, h };
        })
      );
    };
    const onUp = () => setDrag(null);
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    return () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };
  }, [drag, scale, onChange]);

  const startMove = (e: React.PointerEvent, el: EditorElement) => {
    if (!interactive) return;
    if (editingTextId) return;
    e.stopPropagation();
    onSelect(el.id);
    setDrag({
      kind: 'move',
      elementId: el.id,
      startScreenX: e.clientX,
      startScreenY: e.clientY,
      initial: { x: el.x, y: el.y, w: el.w, h: el.h },
    });
  };

  const startResize = (e: React.PointerEvent, el: EditorElement, dir: ResizeDir) => {
    if (!interactive) return;
    e.stopPropagation();
    e.preventDefault();
    setDrag({
      kind: 'resize',
      dir,
      elementId: el.id,
      startScreenX: e.clientX,
      startScreenY: e.clientY,
      initial: { x: el.x, y: el.y, w: el.w, h: el.h },
    });
  };

  const bgOnPointerDown = () => {
    if (!interactive) return;
    onSelect(null);
    if (editingTextId) onExitEditText();
  };

  return (
    <div
      ref={wrapRef}
      className="relative select-none"
      style={{ width: '100%', height: wrapHeight }}
    >
      <div
        onPointerDown={bgOnPointerDown}
        style={{
          width: SLIDE_WIDTH,
          height: SLIDE_HEIGHT,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          position: 'absolute',
          top: 0,
          left: 0,
          backgroundColor: colors.background,
          fontFamily: theme.fontFamily,
          overflow: 'hidden',
          boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
        }}
      >
        {elements.map((el) => {
          const isSelected = interactive && selectedId === el.id;
          return (
            <div
              key={el.id}
              onPointerDown={(e) => startMove(e, el)}
              onDoubleClick={(e) => {
                if (!interactive || el.type !== 'text') return;
                e.stopPropagation();
                onSelect(el.id);
                onEnterEditText(el.id);
              }}
              style={{
                position: 'absolute',
                left: el.x,
                top: el.y,
                width: el.w,
                height: el.h,
                cursor: interactive ? (editingTextId === el.id ? 'text' : 'move') : 'default',
                outline: isSelected ? `2px solid ${colors.accent}` : 'none',
                outlineOffset: 2,
              }}
            >
              <ElementRenderer
                element={el}
                editingTextId={editingTextId}
                accentColor={colors.accent}
                textColor={colors.text}
                textMuted={colors.textMuted}
                onCommitText={commitText}
                onExitEdit={onExitEditText}
              />
              {isSelected && editingTextId !== el.id && (
                <>
                  {(['nw', 'ne', 'sw', 'se'] as ResizeDir[]).map((dir) => (
                    <div
                      key={dir}
                      onPointerDown={(e) => startResize(e, el, dir)}
                      style={{
                        position: 'absolute',
                        width: HANDLE_SIZE * 2,
                        height: HANDLE_SIZE * 2,
                        backgroundColor: '#FFFFFF',
                        border: `2px solid ${colors.accent}`,
                        borderRadius: '50%',
                        top: dir.includes('n') ? -HANDLE_SIZE : undefined,
                        bottom: dir.includes('s') ? -HANDLE_SIZE : undefined,
                        left: dir.includes('w') ? -HANDLE_SIZE : undefined,
                        right: dir.includes('e') ? -HANDLE_SIZE : undefined,
                        cursor:
                          dir === 'nw' || dir === 'se' ? 'nwse-resize' : 'nesw-resize',
                      }}
                    />
                  ))}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
