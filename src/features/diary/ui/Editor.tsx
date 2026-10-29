import { type Draft } from '@/entities/session';

import styles from './Editor.module.css';

export function Editor({
  draft,
  onChange,
  onSave,
  busy,
}: {
  draft: Draft;
  onChange: (d: Draft) => void;
  onSave: () => void;
  busy: boolean;
}) {
  const changeReading = (index: number, field: 'systolic' | 'diastolic' | 'pulse', value: string) =>
    onChange({
      ...draft,
      readings: draft.readings.map((r, i) => (i === index ? { ...r, [field]: value } : r)),
    });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
    >
      <fieldset disabled={busy} className={styles.fields}>
        <label>
          Дата и время
          <input
            type="datetime-local"
            required
            value={draft.date}
            onChange={(e) => onChange({ ...draft, date: e.target.value })}
          />
        </label>
        {draft.readings.map((reading, i) => (
          <fieldset className={styles.reading} key={i}>
            <legend>Измерение {i + 1}</legend>
            <div className={styles.numbers}>
              <label>
                Верхнее
                <input
                  aria-label={`Верхнее ${i + 1}`}
                  inputMode="numeric"
                  pattern="[0-9]+"
                  required
                  value={reading.systolic}
                  onChange={(e) => changeReading(i, 'systolic', e.target.value)}
                />
              </label>
              <label>
                Нижнее
                <input
                  aria-label={`Нижнее ${i + 1}`}
                  inputMode="numeric"
                  pattern="[0-9]+"
                  required
                  value={reading.diastolic}
                  onChange={(e) => changeReading(i, 'diastolic', e.target.value)}
                />
              </label>
              <label>
                Пульс
                <input
                  aria-label={`Пульс ${i + 1}`}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={reading.pulse}
                  onChange={(e) => changeReading(i, 'pulse', e.target.value)}
                />
              </label>
            </div>
            <small>Давление: мм рт. ст. · пульс: уд/мин, необязательно</small>
            {draft.readings.length > 1 && (
              <button
                type="button"
                onClick={() =>
                  onChange({ ...draft, readings: draft.readings.filter((_, index) => index !== i) })
                }
              >
                Удалить измерение {i + 1}
              </button>
            )}
          </fieldset>
        ))}
        <button
          type="button"
          onClick={() =>
            onChange({
              ...draft,
              readings: [...draft.readings, { systolic: '', diastolic: '', pulse: '' }],
            })
          }
        >
          + Ещё измерение
        </button>
        <label>
          Заметка <span>необязательно</span>
          <textarea
            rows={3}
            value={draft.note}
            onChange={(e) => onChange({ ...draft, note: e.target.value })}
          />
        </label>
        <p className={styles.hint}>
          Черновик сохраняется автоматически. В журнал сеанс попадёт после нажатия «Сохранить».
        </p>
        <button className="primary" type="submit">
          {busy ? 'Сохранение…' : 'Сохранить'}
        </button>
      </fieldset>
    </form>
  );
}
