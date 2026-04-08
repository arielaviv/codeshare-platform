import { useState } from 'react';
import Editor from '@monaco-editor/react';

interface CodeEditorProps {
  value: string;
  language: string;
  onChange?: (value: string) => void;
  height?: string;
  readOnly?: boolean;
  showMinimap?: boolean;
}

export default function CodeEditor({
  value,
  language,
  onChange,
  height = '300px',
  readOnly = false,
  showMinimap = false,
}: CodeEditorProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group h-full">
      <Editor
        height={height}
        language={language}
        value={value}
        theme="vs-dark"
        onChange={(val) => onChange?.(val ?? '')}
        loading={
          <div className="bg-[#1E1E1E] flex items-center justify-center" style={{ height }}>
            <span className="text-[#666] text-sm">Loading editor...</span>
          </div>
        }
        options={{
          readOnly,
          fontSize: 13,
          fontFamily: "'Fira Code', 'Cascadia Code', 'JetBrains Mono', Menlo, monospace",
          scrollBeyondLastLine: false,
          wordWrap: 'on',
          automaticLayout: true,
          padding: { top: 12, bottom: 12 },
          minimap: { enabled: showMinimap },
          lineNumbers: 'on',
          domReadOnly: readOnly,
          cursorStyle: readOnly ? 'underline-thin' : 'line',
          renderLineHighlight: readOnly ? 'none' : 'line',
          tabSize: 2,
          folding: true,
          overviewRulerBorder: false,
          hideCursorInOverviewRuler: true,
          scrollbar: {
            verticalScrollbarSize: 8,
            horizontalScrollbarSize: 8,
          },
        }}
      />
      {readOnly && (
        <button
          onClick={handleCopy}
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-[#333] hover:bg-[#444] text-[#ccc] text-xs px-2 py-1 rounded"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      )}
    </div>
  );
}
