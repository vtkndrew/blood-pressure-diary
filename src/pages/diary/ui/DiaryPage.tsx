import { useCallback, useState, type ChangeEvent } from 'react';

import {
  SessionCard,
  Chart,
  filterSessions,
  periodMean,
  displayNumber,
  backup,
  parseBackup,
  mergePreview,
  csv,
  localDate,
  type Session,
  type Period,
} from '@/entities/session';
import { useDiary, Editor } from '@/features/diary';
import { usePwa, PwaPanel } from '@/features/pwa';
import { download } from '@/shared/lib';
import { Dialog } from '@/shared/ui';

import styles from './DiaryPage.module.css';

type WindowName = 'editor' | 'charts' | 'transfer' | 'app' | 'delete' | null;
const titles = {
  editor: 'Запись сеанса',
  charts: 'Графики',
  transfer: 'Копии и отчёт',
  app: 'Приложение',
  delete: 'Удалить сеанс?',
};

export function DiaryPage() {
  const diary = useDiary();
  const pwa = usePwa();
  const [windowName, setWindow] = useState<WindowName>(null);
  const [period, setPeriod] = useState<Period>('30');
  const [from, setFrom] = useState(localDate().slice(0, 10));
  const [to, setTo] = useState(localDate().slice(0, 10));
  const [deleting, setDeleting] = useState<Session | null>(null);
  const [incoming, setIncoming] = useState<Session[] | null>(null);
  const [choices, setChoices] = useState<Record<string, boolean>>({});
  const [fileError, setFileError] = useState('');
  const selected = filterSessions(diary.sessions, period, from, to);
  const means = periodMean(selected);
  const preview = incoming ? mergePreview(diary.sessions, incoming) : null;
  const close = useCallback(() => {
    if (!diary.busy) {
      setWindow(null);
    }
  }, [diary.busy]);

  const start = () => {
    if (!diary.draft) {
      diary.start();
    }

    setWindow('editor');
  };

  const edit = useCallback(
    (session: Session) => {
      if (diary.draft && diary.draft.id !== session.id) {
        setWindow('editor');

        return;
      }

      diary.edit(session);
      setWindow('editor');
    },
    [diary],
  );
  const askDelete = useCallback((session: Session) => {
    setDeleting(session);
    setWindow('delete');
  }, []);
  const save = useCallback(() => {
    void diary.save().then((ok) => {
      if (ok) {
        setWindow(null);
      }
    });
  }, [diary]);

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];

    setIncoming(null);
    setFileError('');
    setChoices({});

    if (!file) {
      return;
    }

    try {
      if (file.size > 10 * 1024 * 1024) {
        throw new Error('Файл слишком большой: максимум 10 МБ.');
      }

      setIncoming(parseBackup(await file.text()).sessions);
    } catch (error) {
      setFileError(error instanceof Error ? error.message : 'Не удалось прочитать файл.');
    }

    e.target.value = '';
  };

  const applyImport = async () => {
    if (!preview) {
      return;
    }

    const sessions = [...preview.added, ...preview.conflicts.filter((s) => choices[s.id] === true)];

    if (await diary.importSessions(sessions)) {
      setIncoming(null);
    }
  };

  const remove = async () => {
    if (deleting && (await diary.remove(deleting.id))) {
      setWindow(null);
      setDeleting(null);
    }
  };

  let periodLabel = `Последние ${period} дней`;

  if (period === 'custom') {
    periodLabel = `${from} — ${to}`;
  }

  if (period === 'all') {
    periodLabel = 'Весь период';
  }

  let mainContent = <p>Загрузка локального дневника…</p>;

  if (!diary.loading) {
    mainContent = (
      <>
        <section className={styles.toolbar} aria-label="Период">
          <label>
            Показать
            <select
              aria-label="Период"
              value={period}
              onChange={(e) => setPeriod(e.target.value as Period)}
            >
              <option value="7">7 дней</option>
              <option value="30">30 дней</option>
              <option value="90">90 дней</option>
              <option value="all">Весь период</option>
              <option value="custom">Свой диапазон</option>
            </select>
          </label>
          {period === 'custom' && (
            <div className={styles.dates}>
              <label>
                С<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </label>
              <label>
                По
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </label>
            </div>
          )}
          <button className="primary" onClick={start}>
            {diary.draft ? 'Продолжить черновик' : '+ Добавить сеанс'}
          </button>
        </section>
        {period === 'custom' && from > to && (
          <p role="alert">Начало диапазона должно быть не позже конца.</p>
        )}
        <section className={styles.summary} aria-label="Средние за период">
          <div>
            <span>Давление · мм рт. ст.</span>
            <strong>
              {displayNumber(means.systolic)} / {displayNumber(means.diastolic)}
            </strong>
          </div>
          <div>
            <span>Пульс · уд/мин</span>
            <strong>{displayNumber(means.pulse)}</strong>
          </div>
          <div>
            <span>Сеансов за период</span>
            <strong>{selected.length}</strong>
          </div>
          <p>Среднее по сеансам. Каждый сеанс имеет одинаковый вес.</p>
        </section>
        <div className={styles.sectionTitle}>
          <h2>Журнал</h2>
          <span>{periodLabel}</span>
        </div>
        {selected.length ? (
          <div className={styles.journal}>
            {selected.map((session) => (
              <SessionCard key={session.id} session={session} onEdit={edit} onDelete={askDelete} />
            ))}
          </div>
        ) : (
          <section className={styles.empty}>
            <span aria-hidden="true">♡</span>
            <h3>Здесь будет ваша история</h3>
            <p>Добавьте первый сеанс или выберите другой период.</p>
            <button onClick={start}>Записать измерения</button>
          </section>
        )}
      </>
    );
  }

  return (
    <>
      <div
        className={styles.page}
        onClickCapture={(event) => {
          if (event.target instanceof Element) {
            event.target.closest<HTMLElement>('button')?.focus();
          }
        }}
      >
        <header className={styles.header}>
          <div className={styles.brand}>
            <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width="48" height="48" />
            <div>
              <p>Личный журнал</p>
              <h1>Дневник давления и пульса</h1>
            </div>
          </div>
          <p className={styles.intro}>Наблюдайте за измерениями. В своём ритме.</p>
          <nav aria-label="Разделы дневника">
            <button onClick={() => setWindow('charts')}>Графики</button>
            <button onClick={() => setWindow('transfer')}>Копии и отчёт</button>
            <button onClick={() => setWindow('app')}>
              {pwa.needRefresh ? 'Приложение · обновление' : 'Приложение'}
            </button>
          </nav>
        </header>
        {diary.error && (
          <section className={styles.error} role="alert">
            <p>{diary.error}</p>
            {diary.conflict ? (
              <>
                <p>
                  Введённое остаётся в этом окне. Перед загрузкой актуальной версии скопируйте
                  нужные значения.
                </p>
                <button
                  onClick={() => {
                    setWindow(null);
                    void diary.reload();
                  }}
                >
                  Загрузить актуальные данные
                </button>
              </>
            ) : (
              <button onClick={() => void diary.retry().catch(() => {})}>
                Повторить сохранение
              </button>
            )}
          </section>
        )}
        <p role="status" className={styles.notice}>
          {diary.notice}
        </p>
        <main>{mainContent}</main>
        <footer>
          Только на вашем устройстве · без аккаунта и отправки данных на сервер.
          <br />
          Дневник хранит измерения и не даёт медицинских оценок.
        </footer>
      </div>
      {windowName && (
        <Dialog title={titles[windowName]} onClose={close}>
          {diary.error && <p role="alert">{diary.error}</p>}
          {windowName === 'editor' && diary.draft && (
            <>
              <Editor
                draft={diary.draft}
                onChange={diary.setDraft}
                onSave={save}
                busy={diary.busy}
              />
              {diary.notice && <p role="alert">{diary.notice}</p>}
              <button
                className={styles.discard}
                disabled={diary.busy}
                onClick={() => {
                  diary.setDraft(null);
                  setWindow(null);
                }}
              >
                Удалить черновик
              </button>
            </>
          )}
          {windowName === 'charts' && (
            <>
              <p>{periodLabel}. Изменить период можно в журнале.</p>
              <h3>Давление</h3>
              <Chart sessions={selected} />
              <h3>Пульс</h3>
              <Chart sessions={selected} pulse />
            </>
          )}
          {windowName === 'app' && <PwaPanel beforeUpdate={diary.flush} />}
          {windowName === 'delete' && (
            <>
              <p>Сеанс {deleting?.date.replace('T', ' ')} и все его измерения будут удалены.</p>
              <div className="actions">
                <button className="danger" disabled={diary.busy} onClick={() => void remove()}>
                  Удалить сеанс
                </button>
                <button onClick={close}>Отмена</button>
              </div>
            </>
          )}
          {windowName === 'transfer' && (
            <section className={styles.transfer}>
              <h3>Сохранить копию</h3>
              <p>
                JSON содержит все сохранённые сеансы с идентификаторами. Черновик в копию не входит.
                Храните файл в безопасном месте.
              </p>
              <button
                disabled={diary.loading}
                onClick={() =>
                  download(
                    'blood-pressure-diary.json',
                    JSON.stringify(backup(diary.sessions), null, 2),
                    'application/json',
                  )
                }
              >
                Скачать JSON
              </button>
              <h3>Для выбранного периода</h3>
              <p>
                {periodLabel} · сеансов: {selected.length}
              </p>
              <div className="actions">
                <button
                  onClick={() =>
                    download('blood-pressure-diary.csv', csv(selected), 'text/csv;charset=utf-8')
                  }
                >
                  Скачать CSV
                </button>
                <button onClick={() => window.print()}>Печать / PDF</button>
              </div>
              <h3>Объединить с копией</h3>
              <label>
                JSON-файл
                <input
                  type="file"
                  accept=".json,application/json"
                  disabled={diary.busy || diary.loading}
                  onChange={(e) => void onFile(e)}
                />
              </label>
              {fileError && <p role="alert">{fileError}</p>}
              {preview && (
                <>
                  <p>
                    Новых: {preview.added.length}. Совпадают: {preview.identical.length}.
                    Конфликтов: {preview.conflicts.length}.
                  </p>
                  {preview.conflicts.map((session) => (
                    <div className={styles.importConflict} key={session.id}>
                      <p>
                        {session.date.replace('T', ' ')} · {session.id}
                      </p>
                      <p>
                        В копии:{' '}
                        {session.readings
                          .map((r) => `${r.systolic}/${r.diastolic}, пульс ${r.pulse ?? '—'}`)
                          .join('; ')}
                        . {session.note}
                      </p>
                      <p>
                        Сейчас:{' '}
                        {diary.sessions
                          .find((s) => s.id === session.id)
                          ?.readings.map(
                            (r) => `${r.systolic}/${r.diastolic}, пульс ${r.pulse ?? '—'}`,
                          )
                          .join('; ')}
                        . {diary.sessions.find((s) => s.id === session.id)?.note}
                      </p>
                      <label>
                        Версия
                        <select
                          aria-label={`Версия ${session.id}`}
                          value={choices[session.id] === true ? 'incoming' : 'current'}
                          onChange={(e) =>
                            setChoices({ ...choices, [session.id]: e.target.value === 'incoming' })
                          }
                        >
                          <option value="current">Оставить текущую</option>
                          <option value="incoming">Взять из копии</option>
                        </select>
                      </label>
                    </div>
                  ))}
                  <button
                    className="primary"
                    disabled={diary.busy || Boolean(diary.error)}
                    onClick={() => void applyImport()}
                  >
                    Подтвердить объединение
                  </button>
                </>
              )}
            </section>
          )}
        </Dialog>
      )}
      <section className={styles.report}>
        <h1>Дневник давления и пульса</h1>
        <p>
          {periodLabel} · Сеансов: {selected.length}
        </p>
        <p>
          Среднее давление: {displayNumber(means.systolic)} / {displayNumber(means.diastolic)} мм
          рт. ст. Пульс: {displayNumber(means.pulse)} уд/мин.
        </p>
        <p>Средние рассчитаны по сеансам с одинаковым весом. Отсутствующий пульс не учитывается.</p>
        {selected.map((s) => (
          <article key={s.id}>
            <h2>{s.date.replace('T', ' ')}</h2>
            <p>
              Среднее: {displayNumber(periodMean([s]).systolic)} /{' '}
              {displayNumber(periodMean([s]).diastolic)}, пульс{' '}
              {displayNumber(periodMean([s]).pulse)}
            </p>
            <ol>
              {s.readings.map((r, i) => (
                <li key={i}>
                  {r.systolic} / {r.diastolic} мм рт. ст. · пульс {r.pulse ?? '—'} уд/мин
                </li>
              ))}
            </ol>
            <p>{s.note}</p>
          </article>
        ))}
      </section>
    </>
  );
}
