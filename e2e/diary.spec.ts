import { expect, test, type Page } from '@playwright/test';

async function openEditor(page: Page) {
  await page.getByRole('button', { name: '+ Добавить сеанс', exact: true }).click();
}

async function fill(page: Page, sys = '120', dia = '80') {
  await page.getByRole('textbox', { name: 'Верхнее 1', exact: true }).fill(sys);
  await page.getByRole('textbox', { name: 'Нижнее 1', exact: true }).fill(dia);
}

async function save(page: Page) {
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

test('CRUD, multiple readings, draft restore, date filter and keyboard dialog', async ({
  page,
}) => {
  await page.goto('/');
  await openEditor(page);
  await fill(page);
  await page.getByRole('textbox', { name: 'Пульс 1', exact: true }).fill('60');
  await page.getByRole('button', { name: '+ Ещё измерение' }).click();
  await page.getByRole('textbox', { name: 'Верхнее 2' }).fill('140');
  await page.getByRole('textbox', { name: 'Нижнее 2' }).fill('90');
  await page.getByRole('textbox', { name: 'Заметка' }).fill('Синтетическая запись');
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const { Repository } = await import('/src/entities/session/api/repository.ts');

        return (await new Repository().load()).draft?.note;
      }),
    )
    .toBe('Синтетическая запись');
  await page.reload();
  await page.getByRole('button', { name: 'Продолжить черновик' }).click();
  await expect(page.getByRole('textbox', { name: 'Верхнее 2' })).toHaveValue('140');
  await save(page);
  await expect(page.locator('article').first()).toContainText('130,0 / 85,0');
  await page.getByRole('button', { name: 'Изменить', exact: true }).click();
  await fill(page, '100');
  await save(page);
  await expect(page.locator('article').first()).toContainText('120,0 / 85,0');
  await page.getByRole('button', { name: 'Графики', exact: true }).click();
  await expect(
    page.getByRole('img', { name: 'График среднего давления по сеансам' }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Графики', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Удалить', exact: true }).click();
  await page.getByRole('button', { name: 'Отмена', exact: true }).click();
  await expect(page.locator('main article')).toHaveCount(1);
  await page.getByRole('button', { name: 'Удалить', exact: true }).click();
  await page.getByRole('button', { name: 'Удалить сеанс', exact: true }).click();
  await expect(page.locator('main article')).toHaveCount(0);
});
test('bad measurement retains input; closed tab restores committed session', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await openEditor(page);
  await fill(page, '80', '90');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('верхнее — больше нижнего');
  await fill(page);
  await save(page);
  await page.close();
  const next = await context.newPage();

  await next.goto('/');
  await expect(next.locator('main article')).toHaveCount(1);
});
test('atomic import preview, duplicate suppression, conflict choice, JSON CSV and print', async ({
  page,
}) => {
  await page.goto('/');
  await openEditor(page);
  await fill(page);
  await save(page);
  await page.getByRole('button', { name: 'Копии и отчёт', exact: true }).click();
  const downloaded = page.waitForEvent('download');

  await page.getByRole('button', { name: 'Скачать JSON' }).click();
  const file = await downloaded;
  const path = await file.path();

  expect(path).toBeTruthy();
  const data = await page.evaluate(async () => {
    const { Repository } = await import('/src/entities/session/api/repository.ts');
    const sessions = (await new Repository().load()).sessions;

    return {
      format: 'blood-pressure-diary',
      version: 1,
      exportedAt: new Date().toISOString(),
      sessions,
    };
  });
  const input = page.locator('input[type=file]');

  await input.setInputFiles({
    name: 'copy.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(data)),
  });
  await expect(page.getByRole('dialog')).toContainText('Совпадают: 1');
  await page.getByRole('button', { name: 'Подтвердить объединение' }).click();
  await expect(page.getByRole('button', { name: 'Подтвердить объединение' })).toHaveCount(0);
  data.sessions[0].note = 'Из копии';
  await input.setInputFiles({
    name: 'copy.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(data)),
  });
  await expect(page.getByRole('dialog')).toContainText('Конфликтов: 1');
  await page
    .getByRole('combobox', { name: `Версия ${data.sessions[0].id}` })
    .selectOption('incoming');
  await page.getByRole('button', { name: 'Подтвердить объединение' }).click();
  await expect(page.getByRole('button', { name: 'Подтвердить объединение' })).toHaveCount(0);
  const csvDownload = page.waitForEvent('download');

  await page.getByRole('button', { name: 'Скачать CSV' }).click();
  expect((await csvDownload).suggestedFilename()).toBe('blood-pressure-diary.csv');
  await page.emulateMedia({ media: 'print' });
  await expect(
    page.getByRole('heading', { name: 'Дневник давления и пульса', exact: true }),
  ).toBeVisible();
  await page.emulateMedia({ media: 'screen' });
  await page.keyboard.press('Escape');
  await expect(page.locator('main article')).toHaveCount(1);
  await expect(page.locator('main article')).toContainText('Из копии');
});
test('a stale tab cannot silently overwrite another tab', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: '+ Добавить сеанс', exact: true })).toBeVisible();
  const other = await context.newPage();

  await other.goto('/');
  await expect(other.getByRole('button', { name: '+ Добавить сеанс', exact: true })).toBeVisible();
  await openEditor(page);
  await fill(page);
  await save(page);
  await openEditor(other);
  await fill(other, '130');
  await expect(other.getByRole('dialog')).toContainText('Дневник изменён в другом окне');
  await other.keyboard.press('Escape');
  await other.getByRole('button', { name: 'Загрузить актуальные данные' }).click();
  await expect(other.locator('main article')).toContainText('120,0 / 80,0');
});
test('IndexedDB failure does not report a successful save and input stays', async ({ page }) => {
  await page.goto('/');
  await openEditor(page);
  await fill(page);
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    let fail = true;

    IDBObjectStore.prototype.put = function (...args) {
      if (fail) {
        throw new DOMException('Synthetic write failure', 'QuotaExceededError');
      }

      return original.apply(this, args);
    };

    (window as any).allowWrite = () => {
      fail = false;
    };
  });
  await page.getByRole('textbox', { name: 'Заметка' }).fill('Не терять');
  await expect(page.getByRole('dialog')).toContainText('Synthetic write failure');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Заметка' })).toHaveValue('Не терять');
  await page.keyboard.press('Escape');
  await page.evaluate(() => (window as any).allowWrite());
  await page.getByRole('button', { name: 'Повторить сохранение' }).click();
  await page.getByRole('button', { name: 'Продолжить черновик' }).click();
  await save(page);
  await expect(page.locator('main article')).toContainText('Не терять');
});

for (const [width, height] of [
  [320, 480],
  [360, 640],
  [390, 844],
  [430, 932],
  [568, 320],
  [844, 390],
  [956, 440],
  [1440, 900],
]) {
  test(`layout ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await openEditor(page);
    await fill(page);
    await page.getByRole('button', { name: '+ Ещё измерение' }).click();
    const dialog = page.getByRole('dialog');

    await expect(dialog).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const boxes = await page.locator('dialog input').evaluateAll((inputs) =>
      inputs.map((e) => {
        const r = e.getBoundingClientRect();

        return { left: r.left, right: r.right };
      }),
    );

    for (const b of boxes) {
      expect(b.left).toBeGreaterThanOrEqual(0);
      expect(b.right).toBeLessThanOrEqual(width);
    }

    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => Boolean(document.activeElement?.closest('dialog')))).toBe(
      true,
    );
    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}

test('initial storage failure retains unsaved input when retry succeeds', async ({ page }) => {
  await page.addInitScript(() => {
    const original = indexedDB.open.bind(indexedDB);
    let fail = sessionStorage.getItem('allow-open') !== 'true';

    indexedDB.open = (...args: Parameters<IDBFactory['open']>) => {
      if (fail) {
        throw new DOMException('Synthetic open failure', 'SecurityError');
      }

      return original(...args);
    };

    (window as any).allowOpen = () => {
      fail = false;
      sessionStorage.setItem('allow-open', 'true');
    };
  });
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('Synthetic open failure');
  await openEditor(page);
  await fill(page, '132', '82');
  await page.getByRole('textbox', { name: 'Заметка' }).fill('Черновик без хранилища');
  await page.keyboard.press('Escape');
  await page.evaluate(() => (window as any).allowOpen());
  await page.getByRole('button', { name: 'Повторить сохранение' }).click();
  await page.getByRole('button', { name: 'Продолжить черновик' }).click();
  await expect(page.getByRole('textbox', { name: 'Верхнее 1' })).toHaveValue('132');
  await save(page);
  await page.reload();
  await expect(page.locator('main article')).toContainText('Черновик без хранилища');
});
test('unknown storage schema is not reset; multi-record import aborts atomically', async ({
  page,
}) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { Repository } = await import('/src/entities/session/api/repository.ts');
    const repository = new Repository('synthetic-transactions');
    const first = {
      id: 'one',
      date: '2026-10-20T12:00',
      updatedAt: '2026-10-20T09:00:00Z',
      note: '',
      readings: [{ systolic: 120, diastolic: 80, pulse: null }],
    };

    await repository.mutate(0, { type: 'save', session: first });
    const original = IDBObjectStore.prototype.put;

    IDBObjectStore.prototype.put = function (value, ...args) {
      if (value.id === 'bad') {
        throw new DOMException('Synthetic failure');
      }

      return original.call(this, value, ...args);
    };

    try {
      await repository.mutate(1, {
        type: 'import',
        sessions: [
          { ...first, id: 'two' },
          { ...first, id: 'bad' },
        ],
      });
    } catch {
    } finally {
      IDBObjectStore.prototype.put = original;
    }

    const snapshot = await repository.load();
    const db = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open('synthetic-transactions');

      request.onsuccess = () => resolve(request.result);
    });

    await new Promise<void>((resolve) => {
      const tx = db.transaction('meta', 'readwrite');

      tx.objectStore('meta').put({ version: 9, revision: 1 }, 'head');
      tx.oncomplete = () => resolve();
    });
    db.close();
    let rejected = false;

    try {
      await repository.load();
    } catch {
      rejected = true;
    }

    return { count: snapshot.sessions.length, revision: snapshot.revision, rejected };
  });

  expect(result).toEqual({ count: 1, revision: 1, rejected: true });
});
