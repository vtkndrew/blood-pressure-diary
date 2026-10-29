export type Reading = { systolic: number; diastolic: number; pulse: number | null };
export type Session = {
  id: string;
  date: string;
  note: string;
  readings: Reading[];
  updatedAt: string;
};
export type Draft = {
  id: string;
  date: string;
  note: string;
  readings: { systolic: string; diastolic: string; pulse: string }[];
};
export type Period = '7' | '30' | '90' | 'all' | 'custom';
export type Backup = {
  format: 'blood-pressure-diary';
  version: 1;
  exportedAt: string;
  sessions: Session[];
};

export function localDate(date = new Date()) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export function newDraft(): Draft {
  return {
    id: crypto.randomUUID(),
    date: localDate(),
    note: '',
    readings: [{ systolic: '', diastolic: '', pulse: '' }],
  };
}

export function editDraft(s: Session): Draft {
  return {
    id: s.id,
    date: s.date,
    note: s.note,
    readings: s.readings.map((r) => ({
      systolic: String(r.systolic),
      diastolic: String(r.diastolic),
      pulse: r.pulse === null ? '' : String(r.pulse),
    })),
  };
}

export function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    return false;
  }

  const parsed = new Date(value);

  return Number.isFinite(parsed.getTime()) && localDate(parsed) === value;
}

function positive(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

export function validateSession(value: unknown): asserts value is Session {
  if (!value || typeof value !== 'object') {
    throw new Error('Неверная запись сеанса.');
  }

  const s = value as Partial<Session>;

  if (
    typeof s.id !== 'string' ||
    !s.id ||
    s.id.length > 200 ||
    !validDate(s.date) ||
    typeof s.note !== 'string' ||
    typeof s.updatedAt !== 'string' ||
    !Number.isFinite(Date.parse(s.updatedAt)) ||
    !Array.isArray(s.readings) ||
    s.readings.length === 0
  ) {
    throw new Error('Неверные данные сеанса.');
  }

  for (const r of s.readings) {
    if (
      !r ||
      !positive(r.systolic) ||
      !positive(r.diastolic) ||
      r.diastolic >= r.systolic ||
      !(r.pulse === null || positive(r.pulse))
    ) {
      throw new Error(
        'Давление должно быть положительным целым; верхнее — больше нижнего. Пульс — положительное целое или пустое поле.',
      );
    }
  }
}

export function validateDraft(value: unknown): asserts value is Draft | null {
  if (value === null) {
    return;
  }

  if (!value || typeof value !== 'object') {
    throw new Error('Повреждён черновик.');
  }

  const d = value as Partial<Draft>;

  if (
    typeof d.id !== 'string' ||
    !d.id ||
    typeof d.date !== 'string' ||
    typeof d.note !== 'string' ||
    !Array.isArray(d.readings) ||
    !d.readings.length ||
    d.readings.some(
      (r) =>
        !r ||
        typeof r.systolic !== 'string' ||
        typeof r.diastolic !== 'string' ||
        typeof r.pulse !== 'string',
    )
  ) {
    throw new Error('Повреждён черновик.');
  }
}

export function commitDraft(d: Draft): Session {
  const number = (v: string) => (/^\d+$/.test(v.trim()) ? Number(v) : NaN);
  const s: Session = {
    ...d,
    readings: d.readings.map((r) => ({
      systolic: number(r.systolic),
      diastolic: number(r.diastolic),
      pulse: r.pulse.trim() === '' ? null : number(r.pulse),
    })),
    updatedAt: new Date().toISOString(),
  };

  validateSession(s);

  return s;
}

function mean(values: number[]) {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

export function sessionMean(s: Session) {
  return {
    systolic: mean(s.readings.map((r) => r.systolic)),
    diastolic: mean(s.readings.map((r) => r.diastolic)),
    pulse: mean(s.readings.flatMap((r) => (r.pulse === null ? [] : [r.pulse]))),
  };
}

export function periodMean(sessions: Session[]) {
  const values = sessions.map(sessionMean);

  return {
    systolic: mean(values.flatMap((s) => (s.systolic === null ? [] : [s.systolic]))),
    diastolic: mean(values.flatMap((s) => (s.diastolic === null ? [] : [s.diastolic]))),
    pulse: mean(values.flatMap((s) => (s.pulse === null ? [] : [s.pulse]))),
  };
}

export function displayNumber(n: number | null) {
  return n === null
    ? '—'
    : n.toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export function filterSessions(
  sessions: Session[],
  period: Period,
  from: string,
  to: string,
  now = new Date(),
) {
  let start = '';
  let end = '';

  if (period === 'custom') {
    start = from;
    end = to;
  } else if (period !== 'all') {
    const d = new Date(now);

    d.setDate(d.getDate() - Number(period) + 1);
    start = localDate(d).slice(0, 10);
    end = localDate(now).slice(0, 10);
  }

  return sessions
    .filter((s) => (!start || s.date.slice(0, 10) >= start) && (!end || s.date.slice(0, 10) <= end))
    .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
}

export function parseBackup(text: string): Backup {
  const value = JSON.parse(text) as Partial<Backup>;

  if (
    !value ||
    value.format !== 'blood-pressure-diary' ||
    value.version !== 1 ||
    typeof value.exportedAt !== 'string' ||
    !Number.isFinite(Date.parse(value.exportedAt)) ||
    !Array.isArray(value.sessions)
  ) {
    throw new Error('Неподдерживаемый формат резервной копии.');
  }

  const ids = new Set<string>();

  for (const session of value.sessions) {
    validateSession(session);

    if (ids.has(session.id)) {
      throw new Error('В копии повторяется ID сеанса.');
    }

    ids.add(session.id);
  }

  return {
    format: 'blood-pressure-diary',
    version: 1,
    exportedAt: value.exportedAt,
    sessions: value.sessions,
  };
}

export function backup(sessions: Session[]): Backup {
  return {
    format: 'blood-pressure-diary',
    version: 1,
    exportedAt: new Date().toISOString(),
    sessions,
  };
}

export function sameSession(a: Session, b: Session) {
  return (
    a.id === b.id &&
    a.date === b.date &&
    a.note === b.note &&
    JSON.stringify(a.readings) === JSON.stringify(b.readings)
  );
}

export function mergePreview(current: Session[], incoming: Session[]) {
  const byId = new Map(current.map((s) => [s.id, s]));

  return {
    added: incoming.filter((s) => !byId.has(s.id)),
    identical: incoming.filter((s) => {
      const old = byId.get(s.id);

      return old && sameSession(old, s);
    }),
    conflicts: incoming.filter((s) => {
      const old = byId.get(s.id);

      return old && !sameSession(old, s);
    }),
  };
}

function csvCell(value: string | number | null) {
  let s = value === null ? '' : String(value);

  if (/^[\s]*[=+@-]|^[\t\r]/.test(s)) {
    s = "'" + s;
  }

  return '"' + s.replaceAll('"', '""') + '"';
}

export function csv(sessions: Session[]) {
  const rows: (string | number | null)[][] = [
    [
      'ID сеанса',
      'Дата и время',
      'Измерение',
      'Верхнее, мм рт. ст.',
      'Нижнее, мм рт. ст.',
      'Пульс, уд/мин',
      'Заметка',
    ],
  ];

  for (const s of sessions) {
    s.readings.forEach((r, i) => {
      rows.push([s.id, s.date, i + 1, r.systolic, r.diastolic, r.pulse, s.note]);
    });
  }

  return '\uFEFF' + rows.map((r) => r.map(csvCell).join(';')).join('\r\n');
}
