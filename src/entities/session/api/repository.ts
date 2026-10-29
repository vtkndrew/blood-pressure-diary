import { validateDraft, validateSession, type Session, type Draft } from '../model/session';

export class Conflict extends Error {
  constructor() {
    super('Дневник изменён в другом окне. Сохраните введённое и загрузите актуальные данные.');
  }
}
export type Snapshot = { revision: number; sessions: Session[]; draft: Draft | null };
export type Mutation =
  | { type: 'draft'; draft: Draft | null }
  | { type: 'save'; session: Session }
  | { type: 'delete'; id: string }
  | { type: 'import'; sessions: Session[] };
const request = <T>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
const done = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('Запись прервана.'));

    tx.onerror = () => {};
  });

export class Repository {
  private connection?: Promise<IDBDatabase>;
  constructor(private name = `blood-pressure-diary:${import.meta.env.BASE_URL}`) {}
  private open() {
    this.connection ??= new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open(this.name, 1);

      r.onupgradeneeded = () => {
        r.result.createObjectStore('sessions', { keyPath: 'id' });
        r.result.createObjectStore('meta');
      };

      r.onerror = () => {
        this.connection = undefined;
        reject(r.error);
      };

      r.onblocked = () => {
        this.connection = undefined;
        reject(new Error('Закройте другие окна приложения и повторите.'));
      };

      r.onsuccess = () => {
        r.result.onversionchange = () => {
          r.result.close();
          this.connection = undefined;
        };

        resolve(r.result);
      };
    }).catch((error) => {
      this.connection = undefined;
      throw error;
    });

    return this.connection;
  }
  async load(): Promise<Snapshot> {
    const db = await this.open();
    const tx = db.transaction(['sessions', 'meta'], 'readonly');
    const completed = done(tx);

    try {
      const meta = tx.objectStore('meta');
      const [sessions, head, draft] = await Promise.all([
        request<Session[]>(tx.objectStore('sessions').getAll()),
        request<{ version: number; revision: number } | undefined>(meta.get('head')),
        request<Draft | undefined>(meta.get('draft')),
      ]);

      await completed;

      if (
        head &&
        (head.version !== 1 || !Number.isSafeInteger(head.revision) || head.revision < 0)
      ) {
        throw new Error('Неизвестная версия или повреждение данных. База сохранена.');
      }

      sessions.forEach(validateSession);
      validateDraft(draft ?? null);

      return { sessions, revision: head?.revision ?? 0, draft: draft ?? null };
    } catch (error) {
      await completed.catch(() => {});
      throw error;
    }
  }
  async mutate(expected: number, mutation: Mutation): Promise<number> {
    if (mutation.type === 'save') {
      validateSession(mutation.session);
    }

    if (mutation.type === 'import') {
      mutation.sessions.forEach(validateSession);
    }

    if (mutation.type === 'draft') {
      validateDraft(mutation.draft);
    }

    const db = await this.open();
    const tx = db.transaction(['sessions', 'meta'], 'readwrite');
    const completed = done(tx);

    try {
      const meta = tx.objectStore('meta');
      const head = await request<{ version: number; revision: number } | undefined>(
        meta.get('head'),
      );

      if (head && head.version !== 1) {
        throw new Error('Неподдерживаемая версия сохранения.');
      }

      if ((head?.revision ?? 0) !== expected) {
        throw new Conflict();
      }

      const sessions = tx.objectStore('sessions');

      if (mutation.type === 'save') {
        sessions.put(mutation.session);
        meta.delete('draft');
      }

      if (mutation.type === 'delete') {
        sessions.delete(mutation.id);
      }

      if (mutation.type === 'draft') {
        if (mutation.draft) {
          meta.put(mutation.draft, 'draft');
        } else {
          meta.delete('draft');
        }
      }

      if (mutation.type === 'import') {
        mutation.sessions.forEach((s) => {
          sessions.put(s);
        });
      }

      const revision = expected + 1;

      meta.put({ version: 1, revision }, 'head');
      await completed;

      return revision;
    } catch (error) {
      try {
        tx.abort();
      } catch {}

      await completed.catch(() => {});
      throw error;
    }
  }
}
