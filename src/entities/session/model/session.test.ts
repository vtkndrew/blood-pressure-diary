import { describe, expect, it } from 'vitest';

import {
  commitDraft,
  newDraft,
  sessionMean,
  periodMean,
  parseBackup,
  backup,
  mergePreview,
  filterSessions,
  csv,
  validDate,
  type Session,
} from './session';

const sample = (
  id = 'one',
  readings = [{ systolic: 120, diastolic: 80, pulse: 60 as number | null }],
): Session => ({
  id,
  date: '2026-10-20T12:00',
  updatedAt: '2026-10-20T09:00:00Z',
  note: '',
  readings,
});

describe('session model', () => {
  it('validates positive integers, pressure order and optional pulse', () => {
    const draft = { ...newDraft(), readings: [{ systolic: '120', diastolic: '80', pulse: '' }] };

    expect(commitDraft(draft).readings[0].pulse).toBeNull();

    for (const values of [
      { systolic: '80', diastolic: '80', pulse: '' },
      { systolic: '0', diastolic: '1', pulse: '' },
      { systolic: '120.5', diastolic: '80', pulse: '' },
      { systolic: '120', diastolic: '80', pulse: '-2' },
    ]) {
      expect(() => commitDraft({ ...draft, readings: [values] })).toThrow();
    }
  });
  it('rejects impossible dates', () => {
    expect(validDate('2026-02-30T12:00')).toBe(false);
    expect(validDate('2026-10-20T12:00')).toBe(true);
  });
  it('weights sessions equally and never fills absent pulse with zero', () => {
    const first = sample('one', [
      { systolic: 120, diastolic: 80, pulse: 60 },
      { systolic: 140, diastolic: 90, pulse: null },
      { systolic: 130, diastolic: 85, pulse: 80 },
    ]);
    const second = sample('two', [{ systolic: 150, diastolic: 95, pulse: null }]);

    expect(sessionMean(first)).toEqual({ systolic: 130, diastolic: 85, pulse: 70 });
    expect(periodMean([first, second])).toEqual({ systolic: 140, diastolic: 90, pulse: 70 });
    expect(periodMean([])).toEqual({ systolic: null, diastolic: null, pulse: null });
    expect(periodMean([first])).toEqual(sessionMean(first));
  });
  it('does not round intermediate values', () => {
    const s = sample('one', [
      { systolic: 121, diastolic: 80, pulse: 61 },
      { systolic: 122, diastolic: 81, pulse: 62 },
      { systolic: 122, diastolic: 81, pulse: 62 },
    ]);

    expect(periodMean([s, sample()]).systolic).toBe((365 / 3 + 120) / 2);
  });
  it('filters inclusive calendar ranges', () => {
    const all = [sample(), { ...sample('two'), date: '2026-10-14T23:59' }];

    expect(filterSessions(all, '7', '', '', new Date('2026-10-20T14:00'))).toHaveLength(2);
    expect(filterSessions(all, 'custom', '2026-10-20', '2026-10-20')).toHaveLength(1);
    expect(filterSessions(all, 'all', '', '')).toHaveLength(2);
  });
  it('round trips JSON, detects duplicates and unknown versions', () => {
    const b = backup([sample()]);

    expect(parseBackup(JSON.stringify(b))).toEqual(b);
    expect(() => parseBackup(JSON.stringify({ ...b, version: 2 }))).toThrow();
    expect(() => parseBackup(JSON.stringify({ ...b, sessions: [sample(), sample()] }))).toThrow();
    expect(() => parseBackup('{')).toThrow();
  });
  it('previews new, identical and conflicting records', () => {
    const current = [sample()];

    expect(mergePreview(current, [sample(), sample('new')])).toMatchObject({
      added: [sample('new')],
      identical: [sample()],
      conflicts: [],
    });
    expect(mergePreview(current, [{ ...sample(), note: 'changed' }]).conflicts).toHaveLength(1);
  });
  it('escapes CSV delimiters, quotes, line breaks and formulas', () => {
    const text = csv([{ ...sample(), note: '=SUM(1;2)\n"note"' }]);

    expect(text).toContain(`"'=SUM(1;2)\n""note"""`);
    expect(text.startsWith('\uFEFF')).toBe(true);
    expect(csv([sample('=ID')])).toContain(`"'=ID"`);
  });
});
