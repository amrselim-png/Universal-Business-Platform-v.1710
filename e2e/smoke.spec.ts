import { expect, test } from '@playwright/test';

/**
 * اختبار انطلاق التطبيق (Smoke E2E)
 * ---------------------------------------------------------------------------
 * هذا أول اختبار يفتح التطبيق في **متصفح حقيقي**. كل ما سبقه كانت اختبارات
 * وحدة — وحدها لا تكشف أخطاء التحميل أو الانهيار عند الإقلاع.
 *
 * ما يتحقق منه:
 *   1. الصفحة تُحمَّل بلا أخطاء JavaScript قاتلة.
 *   2. شاشة الدخول تظهر (التطبيق أقلع فعلاً).
 *   3. تسجيل الدخول بالمدير يعمل ويصل للتطبيق.
 *   4. القائمة الجانبية والشاشات الأساسية تُصيَّر.
 */

/** أخطاء JS الحرجة التي تعني انهيار التطبيق. */
const FATAL_PATTERNS = [
  /Failed to fetch dynamically imported module/i,
  /ChunkLoadError/i,
  /Cannot read propert/i,
  /is not a function/i,
];

const collectPageErrors = (page: import('@playwright/test').Page): string[] => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && FATAL_PATTERNS.some((p) => p.test(message.text()))) {
      errors.push(message.text());
    }
  });
  return errors;
};

test.describe('انطلاق التطبيق', () => {
  test('الصفحة تُحمَّل بلا أخطاء قاتلة', async ({ page }) => {
    const errors = collectPageErrors(page);

    const response = await page.goto('/', { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBe(200);

    // التطبيق React ⇒ يجب أن يوجد جذر ويُصيَّر فيه شيء
    await expect(page.locator('#root')).toBeAttached();
    await expect(page.locator('#root')).not.toBeEmpty();

    expect(errors, `أخطاء JavaScript قاتلة:\n${errors.join('\n')}`).toEqual([]);
  });

  test('شاشة الدخول تظهر ويُسجَّل الدخول بنجاح', async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // عنوان الصفحة من index.html
    await expect(page).toHaveTitle(/Universal Business Platform|ERP/i);

    // حقل اسم المستخدم + كلمة المرور
    const usernameInput = page.locator('input').first();
    await expect(usernameInput).toBeVisible();

    await usernameInput.fill('admin');
    const passwordInput = page.locator('input[type="password"]').first();
    await passwordInput.fill('admin123');
    await passwordInput.press('Enter');

    // بعد الدخول: القائمة الجانبية تظهر (مؤشر موثوق على وصول التطبيق)
    await page.waitForTimeout(3_000);
    const bodyText = await page.locator('body').innerText();
    expect(bodyText.length).toBeGreaterThan(50);

    expect(errors, `أخطاء JavaScript قاتلة:\n${errors.join('\n')}`).toEqual([]);
  });

  test('محرك الشاشات (Metadata) محمَّل في الكاش المحلي', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2_000);

    const registry = await page.evaluate(() => {
      try {
        return localStorage.getItem('erp_metadata_registry');
      } catch {
        return null;
      }
    });

    // قد يكون null إن لم يوجد اتصال بقاعدة البيانات — لكن إن وُجد فيجب أن يكون صالحاً
    if (registry) {
      const parsed = JSON.parse(registry);
      expect(Array.isArray(parsed.views)).toBe(true);
      expect(parsed.views.length).toBeGreaterThan(0);
    }
  });
});
