import { useEffect, useRef } from 'react';
import type { TextElement as TextElementType } from '../../../types/deck';

interface Props {
  element: TextElementType;
  editing: boolean;
  onCommit: (content: string) => void;
  onExitEdit: () => void;
}

export default function TextElement({ element, editing, onCommit, onExitEdit }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (editing && ref.current) {
      ref.current.focus();
      const range = document.createRange();
      range.selectNodeContents(ref.current);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  }, [editing]);

  const style: React.CSSProperties = {
    width: '100%',
    height: '100%',
    fontSize: element.fontSize,
    fontWeight: element.fontWeight,
    textAlign: element.align,
    color: element.color,
    fontStyle: element.italic ? 'italic' : 'normal',
    textDecoration: element.underline ? 'underline' : 'none',
    lineHeight: 1.2,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    overflow: 'hidden',
    cursor: editing ? 'text' : 'inherit',
    outline: 'none',
    userSelect: editing ? 'text' : 'none',
  };

  if (editing) {
    return (
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        style={style}
        onBlur={() => {
          const text = ref.current?.innerText ?? '';
          onCommit(text);
          onExitEdit();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            onExitEdit();
          }
          e.stopPropagation();
        }}
      >
        {element.content}
      </div>
    );
  }

  return <div style={style}>{element.content}</div>;
}
