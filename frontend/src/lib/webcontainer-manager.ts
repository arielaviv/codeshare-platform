import type { WebContainer, FileSystemTree } from '@webcontainer/api';

export type WCStatus = 'idle' | 'booting' | 'mounting' | 'installing' | 'starting' | 'running' | 'error';

export interface WCState {
  status: WCStatus;
  url: string | null;
  error: string | null;
  installLogs: string;
  devLogs: string;
}

type Listener = (state: WCState) => void;

function mapToFileSystemTree(files: Map<string, string>): FileSystemTree {
  const tree: FileSystemTree = {};

  for (const [path, content] of files) {
    const parts = path.split('/');
    let current = tree;

    for (let i = 0; i < parts.length; i++) {
      const name = parts[i];
      if (i === parts.length - 1) {
        current[name] = { file: { contents: content } };
      } else {
        if (!current[name]) {
          current[name] = { directory: {} };
        }
        const dir = current[name];
        if ('directory' in dir) {
          current = dir.directory;
        }
      }
    }
  }
  return tree;
}

class WebContainerManager {
  private container: WebContainer | null = null;
  private state: WCState = { status: 'idle', url: null, error: null, installLogs: '', devLogs: '' };
  private listeners: Set<Listener> = new Set();
  private installedPkgHash: string | null = null;
  private currentFiles: Map<string, string> = new Map();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  private update(partial: Partial<WCState>) {
    this.state = { ...this.state, ...partial };
    this.listeners.forEach((l) => l(this.state));
  }

  getState(): WCState {
    return this.state;
  }

  /** Read-only copy of the files currently mounted. Used by the Theme
   *  editor + Library panel to read + rewrite project source. */
  getFiles(): Map<string, string> {
    return new Map(this.currentFiles);
  }

  private hashString(s: string): string {
    let hash = 0;
    for (let i = 0; i < s.length; i++) {
      hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
    }
    return hash.toString(36);
  }

  async boot(): Promise<WebContainer | null> {
    if (this.container) return this.container;

    this.update({ status: 'booting', error: null, url: null });
    try {
      const { WebContainer: WC } = await import('@webcontainer/api');
      this.container = await WC.boot();
      return this.container;
    } catch (err) {
      this.update({ status: 'error', error: `Boot failed: ${(err as Error).message}` });
      return null;
    }
  }

  async run(files: Map<string, string>): Promise<void> {
    const container = await this.boot();
    if (!container) return;

    this.currentFiles = new Map(files);

    this.update({ status: 'mounting', installLogs: '', devLogs: '' });

    const filesWithEnv = new Map(files);
    if (!filesWithEnv.has('.env')) {
      const envLines: string[] = [];
      const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN;
      const anthropicKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
      if (mapboxToken) envLines.push(`VITE_MAPBOX_TOKEN=${mapboxToken}`);
      if (anthropicKey) envLines.push(`VITE_ANTHROPIC_API_KEY=${anthropicKey}`);
      if (envLines.length > 0) filesWithEnv.set('.env', envLines.join('\n') + '\n');
    }

    const tree = mapToFileSystemTree(filesWithEnv);
    await container.mount(tree);

    const pkgJson = files.get('package.json');
    if (!pkgJson) {
      this.update({ status: 'error', error: 'No package.json found' });
      return;
    }

    const pkgHash = this.hashString(pkgJson);
    if (pkgHash !== this.installedPkgHash) {
      this.update({ status: 'installing' });
      const installProcess = await container.spawn('npm', ['install']);

      installProcess.output.pipeTo(new WritableStream({
        write: (chunk) => {
          const logs = (this.state.installLogs + chunk).slice(-50000);
          this.update({ installLogs: logs });
        },
      }));

      const installExit = await installProcess.exit;
      if (installExit !== 0) {
        this.update({ status: 'error', error: 'npm install failed' });
        return;
      }
      this.installedPkgHash = pkgHash;
    }

    this.update({ status: 'starting' });
    const devProcess = await container.spawn('npm', ['run', 'dev']);

    devProcess.output.pipeTo(new WritableStream({
      write: (chunk) => {
        const logs = (this.state.devLogs + chunk).slice(-50000);
          this.update({ devLogs: logs });
      },
    }));

    container.on('server-ready', (_port, url) => {
      this.update({ status: 'running', url });
    });

    // If the dev process exits before server-ready, surface the tail of
    // its logs — otherwise the preview just hangs on "starting".
    void devProcess.exit.then((code) => {
      if (this.state.status !== 'running') {
        const tail = this.state.devLogs.split('\n').slice(-15).join('\n');
        this.update({
          status: 'error',
          error: `Dev server exited with code ${code} before becoming ready.\n${tail}`,
        });
      }
    });

    setTimeout(() => {
      if (this.state.status === 'starting') {
        const tail = this.state.devLogs.split('\n').slice(-15).join('\n');
        this.update({
          status: 'error',
          error: `Dev server timeout (60s). Last output:\n${tail}`,
        });
      }
    }, 60000);
  }

  async updateFiles(files: Map<string, string>): Promise<void> {
    if (!this.container || this.state.status === 'idle' || this.state.status === 'error') return;

    for (const [path, content] of files) {
      if (this.currentFiles.get(path) !== content) {
        // Ensure parent dir exists — WebContainer's fs.writeFile does NOT
        // auto-create parents, and the agent can stream files in any
        // order (e.g., src/index.css before src/main.tsx), so any nested
        // path needs a recursive mkdir first. Without this, Vite errors
        // with ENOENT and the preview hangs.
        const lastSlash = path.lastIndexOf('/');
        if (lastSlash > 0) {
          const dir = path.slice(0, lastSlash);
          try {
            await this.container.fs.mkdir(dir, { recursive: true });
          } catch {
            // mkdir is idempotent when dir exists — ignore.
          }
        }
        try {
          await this.container.fs.writeFile(path, content);
        } catch (err) {
          // Surface to devLogs so the user/devtools see the real failure
          // instead of a silent unhandled rejection.
          const msg = err instanceof Error ? err.message : String(err);
          console.warn(`[wc] writeFile failed ${path}: ${msg}`);
        }
      }
    }

    for (const path of this.currentFiles.keys()) {
      if (!files.has(path)) {
        try { await this.container.fs.rm(path); } catch { /* file may not exist */ }
      }
    }

    this.currentFiles = new Map(files);
  }

  async destroy(): Promise<void> {
    if (this.container) {
      this.container.teardown();
      this.container = null;
    }
    this.installedPkgHash = null;
    this.currentFiles.clear();
    this.update({ status: 'idle', url: null, error: null, installLogs: '', devLogs: '' });
  }
}

export const wcManager = new WebContainerManager();
