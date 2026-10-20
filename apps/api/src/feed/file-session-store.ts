import { mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { FeedSession, SessionStore } from './feed-engine';

// Single API process, durable across restarts. Use a shared transactional store for multiple replicas.
export class FileSessionStore implements SessionStore {
  constructor(private readonly directory: string) { mkdirSync(directory, { recursive: true, mode: 0o700 }); }
  private path(id: string) {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('Invalid session ID');
    return join(this.directory, `${id}.json`);
  }
  get(id: string): FeedSession | undefined {
    try { return JSON.parse(readFileSync(this.path(id), 'utf8')) as FeedSession; }
    catch { return undefined; }
  }
  set(id: string, session: FeedSession) {
    const target = this.path(id), temporary = `${target}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temporary, JSON.stringify(session), { mode: 0o600 });
      renameSync(temporary, target);
    } finally { try { unlinkSync(temporary); } catch {} }
  }
  prune(now: number, capacity: number) {
    const active: Array<{ id: string; expires: number }> = [];
    for (const name of readdirSync(this.directory)) {
      if (!/^[a-f0-9-]{36}\.json$/.test(name)) continue;
      const id = name.slice(0, -5), session = this.get(id);
      if (!session || session.expires <= now) { try { unlinkSync(this.path(id)); } catch {} }
      else active.push({ id, expires: session.expires });
    }
    active.sort((a, b) => a.expires - b.expires);
    while (active.length >= capacity) { const entry = active.shift()!; unlinkSync(this.path(entry.id)); }
  }
}
