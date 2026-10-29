import { useCallback, useEffect, useRef, useState } from 'react';

import {
  Repository,
  Conflict,
  newDraft,
  editDraft,
  commitDraft,
  type Snapshot,
  type Draft,
  type Session,
  type Mutation,
} from '@/entities/session';

export function useDiary() {
  const [repository] = useState(() => new Repository());
  const [snapshot, setSnapshot] = useState<Snapshot>({ revision: 0, sessions: [], draft: null });
  const current = useRef(snapshot);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const queue = useRef<Promise<void>>(Promise.resolve());
  const failed = useRef(false);
  const loaded = useRef(false);
  const requested = useRef(false);
  const bootStarted = useRef(false);
  const apply = useCallback((value: Snapshot) => {
    current.current = value;
    setSnapshot(value);
  }, []);
  const reload = useCallback(async () => {
    setLoading(true);

    try {
      await queue.current;
      const value = await repository.load();

      apply(value);
      setError(null);
      setConflict(false);
      failed.current = false;
      loaded.current = true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Хранилище недоступно. Ввод остаётся на экране.');
    } finally {
      setLoading(false);
    }
  }, [repository, apply]);

  useEffect(() => {
    if (!bootStarted.current) {
      bootStarted.current = true;
      void reload();
    }
  }, [reload]);
  const persist = useCallback(
    (mutation: Mutation) => {
      const run = queue.current.then(async () => {
        if (failed.current || !loaded.current) {
          throw new Error('Сначала повторите сохранение или загрузите актуальные данные.');
        }

        try {
          const revision = await repository.mutate(current.current.revision, mutation);
          let next = { ...current.current, revision };

          if (mutation.type === 'save') {
            next = {
              ...next,
              sessions: [
                ...next.sessions.filter((s) => s.id !== mutation.session.id),
                mutation.session,
              ],
              draft: null,
            };
          }

          if (mutation.type === 'delete') {
            next = { ...next, sessions: next.sessions.filter((s) => s.id !== mutation.id) };
          }

          if (mutation.type === 'import') {
            const map = new Map(next.sessions.map((s) => [s.id, s]));

            mutation.sessions.forEach((s) => {
              map.set(s.id, s);
            });
            next = { ...next, sessions: [...map.values()] };
          }

          apply(next);
          setError(null);

          if (!requested.current) {
            requested.current = true;

            try {
              void navigator.storage?.persist?.().catch(() => {});
            } catch {}
          }
        } catch (e) {
          failed.current = true;
          setConflict(e instanceof Conflict);
          setError(
            e instanceof Error ? e.message : 'Не удалось сохранить данные. Повторите попытку.',
          );
          throw e;
        }
      });

      queue.current = run.catch(() => {});

      return run;
    },
    [repository, apply],
  );
  const setDraft = useCallback(
    (draft: Draft | null) => {
      setNotice('');
      apply({ ...current.current, draft });

      if (loaded.current) {
        void persist({ type: 'draft', draft }).catch(() => {});
      }
    },
    [apply, persist],
  );
  const retry = useCallback(async () => {
    await queue.current;

    if (!loaded.current) {
      const draft = current.current.draft;

      await reload();

      if (loaded.current && draft) {
        apply({ ...current.current, draft });
        await persist({ type: 'draft', draft });
      }

      return;
    }

    failed.current = false;
    await persist({ type: 'draft', draft: current.current.draft });
  }, [persist, reload, apply]);
  const flush = useCallback(async () => {
    await queue.current;

    if (failed.current || !loaded.current) {
      throw new Error('Данные пока не сохранены. Повторите сохранение перед обновлением.');
    }
  }, []);

  useEffect(() => {
    const hide = () => {
      void flush().catch(() => {});
    };

    document.addEventListener('visibilitychange', hide);
    window.addEventListener('pagehide', hide);

    return () => {
      document.removeEventListener('visibilitychange', hide);
      window.removeEventListener('pagehide', hide);
    };
  }, [flush]);
  const save = useCallback(async () => {
    const draft = current.current.draft;

    if (!draft) {
      return false;
    }

    let session: Session;

    try {
      session = commitDraft(draft);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Проверьте измерения.');

      return false;
    }

    setBusy(true);

    try {
      await persist({ type: 'save', session });
      setNotice('Сеанс сохранён');

      return true;
    } catch {
      return false;
    } finally {
      setBusy(false);
    }
  }, [persist]);
  const remove = useCallback(
    async (id: string) => {
      setBusy(true);

      try {
        await persist({ type: 'delete', id });
        setNotice('Сеанс удалён');

        return true;
      } catch {
        return false;
      } finally {
        setBusy(false);
      }
    },
    [persist],
  );
  const importSessions = useCallback(
    async (sessions: Session[]) => {
      setBusy(true);

      try {
        await persist({ type: 'import', sessions });
        setNotice('Копия объединена с дневником');

        return true;
      } catch {
        return false;
      } finally {
        setBusy(false);
      }
    },
    [persist],
  );

  return {
    ...snapshot,
    loading,
    error,
    conflict,
    busy,
    notice,
    setDraft,
    reload,
    retry,
    flush,
    save,
    remove,
    importSessions,
    start: () => setDraft(newDraft()),
    edit: (s: Session) => setDraft(editDraft(s)),
  };
}
