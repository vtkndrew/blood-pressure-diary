import { expect, test, type Page } from '@playwright/test';

const base = '/blood-pressure-diary/';

async function ready(page: Page) {
  await page.goto(base);
  await page.getByRole('button', { name: 'Приложение', exact: true }).click();
  await expect(page.getByText('Готово к работе без интернета', { exact: true })).toBeVisible({
    timeout: 20000,
  });
  await page.keyboard.press('Escape');
  await page.evaluate(() => navigator.serviceWorker.ready);
}

async function create(page: Page, note: string) {
  await page.getByRole('button', { name: '+ Добавить сеанс', exact: true }).click();
  await page.getByRole('textbox', { name: 'Верхнее 1' }).fill('120');
  await page.getByRole('textbox', { name: 'Нижнее 1' }).fill('80');
  await page.getByRole('textbox', { name: 'Заметка' }).fill(note);
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.locator('main article')).toContainText(note);
}

test('manifest, icon dimensions and isolated worker scope', async ({ page, request }) => {
  await ready(page);
  const response = await request.get(`${base}manifest.webmanifest`);
  const manifest = await response.json();

  expect(manifest.scope).toBe(base);
  expect(manifest.start_url).toBe(base);
  expect(manifest.display).toBe('standalone');
  expect(
    await page.evaluate(async () => new URL((await navigator.serviceWorker.ready).scope).pathname),
  ).toBe(base);

  for (const icon of manifest.icons) {
    const dimensions = await page.evaluate(async (src) => {
      const image = new Image();

      image.src = src;
      await image.decode();

      return `${image.naturalWidth}x${image.naturalHeight}`;
    }, `${base}${icon.src}`);

    expect(dimensions).toBe(icon.sizes);
  }
});
test('offline reopen, new offline records and restored draft', async ({
  page,
  context,
  browserName,
}) => {
  await ready(page);
  await create(page, 'Онлайн');
  await page.getByRole('button', { name: '+ Добавить сеанс', exact: true }).click();
  await page.getByRole('textbox', { name: 'Верхнее 1' }).fill('135');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Приложение', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const r = indexedDB.open('blood-pressure-diary:/blood-pressure-diary/');

          r.onsuccess = () => resolve(r.result);
          r.onerror = () => reject(r.error);
        });
        const result = await new Promise<string>((resolve) => {
          const r = db.transaction('meta').objectStore('meta').get('draft');

          r.onsuccess = () => resolve(r.result?.readings[0].systolic);
        });

        db.close();

        return result;
      }),
    )
    .toBe('135');

  if (browserName === 'webkit') {
    await context.addCookies([
      { name: 'pwa_test_offline', value: '1', url: 'http://127.0.0.1:4175' },
    ]);
  } else {
    await context.setOffline(true);
  }

  await page.close();
  const next = await context.newPage();

  await next.goto(base);
  await expect(next.locator('main article')).toContainText('Онлайн');
  await next.getByRole('button', { name: 'Продолжить черновик' }).click();
  await expect(next.getByRole('textbox', { name: 'Верхнее 1' })).toHaveValue('135');
  await next.getByRole('textbox', { name: 'Нижнее 1' }).fill('85');
  await next.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(next.locator('main article')).toHaveCount(2);
  await next.reload();
  await expect(next.locator('main article')).toHaveCount(2);
});
test('update waits for consent, keeps sessions/draft and leaves other caches/databases', async ({
  page,
  context,
}) => {
  await ready(page);
  await create(page, 'До обновления');
  await page.getByRole('button', { name: '+ Добавить сеанс', exact: true }).click();
  await page.getByRole('textbox', { name: 'Верхнее 1' }).fill('125');
  await page.keyboard.press('Escape');
  await page.evaluate(async () => {
    const cache = await caches.open('pyramids-precache-fixture');

    await cache.put('/pyramids/sentinel', new Response('keep'));
    await new Promise<void>((resolve, reject) => {
      const r = indexedDB.open('pyramids-saves:/pyramids/');

      r.onupgradeneeded = () => r.result.createObjectStore('sentinel');

      r.onsuccess = () => {
        const db = r.result;
        const tx = db.transaction('sentinel', 'readwrite');

        tx.objectStore('sentinel').put('keep', 'key');

        tx.oncomplete = () => {
          db.close();
          resolve();
        };
      };

      r.onerror = () => reject(r.error);
    });
  });
  await context.addCookies([
    { name: 'pwa_test_version', value: 'two', url: 'http://127.0.0.1:4175' },
  ]);
  await page.evaluate(async () => {
    await (await navigator.serviceWorker.ready).update();
  });
  await page.getByRole('button', { name: 'Приложение · обновление', exact: true }).click();
  await page.getByRole('button', { name: 'Обновить', exact: true }).click();
  await page.getByRole('button', { name: 'Позже', exact: true }).click();
  expect(await page.locator('html').getAttribute('data-pwa-test-build')).toBe('one');
  await page.getByRole('button', { name: 'Обновить', exact: true }).click();
  await page.getByRole('button', { name: 'Обновить и перезапустить' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-pwa-test-build', 'two', {
    timeout: 20000,
  });
  await expect(page.locator('main article')).toContainText('До обновления');
  await page.getByRole('button', { name: 'Продолжить черновик' }).click();
  await expect(page.getByRole('textbox', { name: 'Верхнее 1' })).toHaveValue('125');
  expect(
    await page.evaluate(async () =>
      Boolean(await (await caches.open('pyramids-precache-fixture')).match('/pyramids/sentinel')),
    ),
  ).toBe(true);
  expect(
    await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve) => {
        const r = indexedDB.open('pyramids-saves:/pyramids/');

        r.onsuccess = () => resolve(r.result);
      });

      return new Promise((resolve) => {
        const r = db.transaction('sentinel').objectStore('sentinel').get('key');

        r.onsuccess = () => {
          db.close();
          resolve(r.result);
        };
      });
    }),
  ).toBe('keep');
});
test('install prompt is one shot and standalone does not offer installation', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    const event = new Event('beforeinstallprompt');

    Object.assign(event, {
      prompt: async () => {},
      userChoice: Promise.resolve({ outcome: 'dismissed' }),
    });
    window.dispatchEvent(event);
  });
  await page.getByRole('button', { name: 'Приложение', exact: true }).click();
  await page.getByRole('button', { name: 'Установить', exact: true }).click();
  await expect(page.getByText('Установка отменена.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Установить', exact: true })).toHaveCount(0);
  await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
  await expect(page.getByText('Приложение установлено', { exact: true })).toBeVisible();
});

test('a failed save prevents applying an update', async ({ page, context }) => {
  await ready(page);
  await page.getByRole('button', { name: '+ Добавить сеанс', exact: true }).click();
  await page.evaluate(() => {
    IDBObjectStore.prototype.put = function () {
      throw new DOMException('Synthetic write failure', 'QuotaExceededError');
    };
  });
  await page.getByRole('textbox', { name: 'Верхнее 1' }).fill('131');
  await expect(page.getByRole('dialog')).toContainText('Synthetic write failure');
  await page.keyboard.press('Escape');
  await context.addCookies([
    { name: 'pwa_test_version', value: 'two', url: 'http://127.0.0.1:4175' },
  ]);
  await page.evaluate(async () => {
    await (await navigator.serviceWorker.ready).update();
  });
  await page.getByRole('button', { name: 'Приложение · обновление', exact: true }).click();
  await page.getByRole('button', { name: 'Обновить', exact: true }).click();
  await page.getByRole('button', { name: 'Обновить и перезапустить' }).click();
  await expect(page.getByRole('dialog')).toContainText('Данные пока не сохранены');
  await expect(page.locator('html')).toHaveAttribute('data-pwa-test-build', 'one');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Продолжить черновик' }).click();
  await expect(page.getByRole('textbox', { name: 'Верхнее 1' })).toHaveValue('131');
});
test('iOS instructions and standalone startup', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'userAgent', { get: () => 'iPhone' });
  });
  await ready(page);
  await page.getByRole('button', { name: 'Приложение', exact: true }).click();
  await expect(page.getByText('Откройте сайт в Safari', { exact: false })).toBeVisible();
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'standalone', { get: () => true });
  });
  await page.reload();
  await page.getByRole('button', { name: 'Приложение', exact: true }).click();
  await expect(page.getByText('Приложение установлено', { exact: true })).toBeVisible();
  await expect(page.getByText('Откройте сайт в Safari', { exact: false })).toHaveCount(0);
});
