import { useState } from 'react';

interface SettingsModalProps {
  projectName: string;
  onProjectNameChange: (name: string) => void;
  onClose: () => void;
}

const SIDEBAR_ITEMS = [
  { id: 'general', label: 'General', icon: '⚙' },
  { id: 'environment', label: 'Environment', icon: '🔑' },
];

export default function SettingsModal({ projectName, onProjectNameChange, onClose }: SettingsModalProps) {
  const [activeSection, setActiveSection] = useState('general');
  const [name, setName] = useState(projectName);
  const [envVars, setEnvVars] = useState<{ key: string; value: string }[]>([
    { key: 'VITE_MAPBOX_TOKEN', value: 'pk.eyJ1Ijo...' },
  ]);

  const handleSaveName = () => {
    onProjectNameChange(name);
  };

  const addEnvVar = () => {
    setEnvVars((prev) => [...prev, { key: '', value: '' }]);
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl w-[700px] max-h-[500px] flex overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="w-[200px] border-r border-[#2A2A2A] py-4 flex-shrink-0">
          <div className="px-4 mb-3 text-xs font-medium text-[#888] uppercase tracking-wider">Project Settings</div>
          {SIDEBAR_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveSection(item.id)}
              className={`w-full flex items-center gap-2.5 px-4 py-2 text-sm transition-colors ${
                activeSection === item.id
                  ? 'bg-[#3B82F6]/10 text-[#60A5FA]'
                  : 'text-[#A0A0A0] hover:text-[#E8E8E8] hover:bg-[#222]'
              }`}
            >
              <span>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>

        <div className="flex-1 p-6 overflow-y-auto subtle-scrollbar">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-[#E8E8E8]">
              {activeSection === 'general' ? 'Project General Settings' : 'Environment Variables'}
            </h2>
            <button onClick={onClose} className="text-[#666] hover:text-[#E8E8E8] transition-colors">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          {activeSection === 'general' && (
            <div className="space-y-6">
              <div>
                <label className="text-xs font-medium text-[#888] uppercase tracking-wider mb-2 block">Project name</label>
                <div className="flex gap-2">
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="flex-1 px-3 py-2 bg-[#141414] border border-[#2A2A2A] rounded-lg text-sm text-[#E8E8E8] focus:outline-none focus:border-[#555]"
                  />
                  <button onClick={handleSaveName} className="px-4 py-2 bg-[#2A2A2A] text-[#E8E8E8] text-sm rounded-lg hover:bg-[#333] transition-colors">
                    Save
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeSection === 'environment' && (
            <div className="space-y-4">
              <p className="text-xs text-[#888]">Environment variables are injected into your project's .env file.</p>
              {envVars.map((v, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    value={v.key}
                    onChange={(e) => setEnvVars((prev) => prev.map((p, j) => j === i ? { ...p, key: e.target.value } : p))}
                    placeholder="KEY"
                    className="w-1/3 px-3 py-2 bg-[#141414] border border-[#2A2A2A] rounded-lg text-xs font-mono text-[#E8E8E8] focus:outline-none focus:border-[#555]"
                  />
                  <input
                    value={v.value}
                    onChange={(e) => setEnvVars((prev) => prev.map((p, j) => j === i ? { ...p, value: e.target.value } : p))}
                    placeholder="value"
                    className="flex-1 px-3 py-2 bg-[#141414] border border-[#2A2A2A] rounded-lg text-xs font-mono text-[#E8E8E8] focus:outline-none focus:border-[#555]"
                  />
                  <button
                    onClick={() => setEnvVars((prev) => prev.filter((_, j) => j !== i))}
                    className="px-2 text-[#666] hover:text-red-400 transition-colors"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
              <button onClick={addEnvVar} className="text-xs text-[#3B82F6] hover:text-[#60A5FA] transition-colors">
                + Add variable
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
