export interface SSEWriter {
  send(event: string, data: unknown): void;
  end(): void;
}
