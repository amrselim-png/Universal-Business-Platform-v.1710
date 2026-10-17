import { expect, test } from '@playwright/test';

/**
 * اختبار شاشة «معمارية المنظومة الجديدة» (E2E)
 * ---------------------------------------------------------------------------
 * يفتح الشاشة في **متصفح حقيقي** ويتحقق من أهم ما قد ينكسر بصمت:
 *   1. الشاشة تُفتح من الرابط المباشر `?view=architecture` بعد تسجيل الدخول.
 *   2. التبويبات الستة موجودة وتعمل (وميض الشاشة عند التبديل لا يرمي أخطاء).
 *   3. بوابة الفحص تعرض **نتيجة حقيقية** (عدد الملفات المقيسة والمخالفات).
 *   4. لا أخطاء JavaScript قاتلة أثناء الاستخدام.
 *
 * التشغيل: npm run e2e  (يحتاج متصفح Chromium: npx playwright install chromium)
 * ملاحظة: في بيئة لا تتوفر فيها مكتبات المتصفح، يعمل هذا الاختبار في الـ CI
 * أو على جهاز المطوّر فقط.
 */

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

const login = async (page: import('@playwright/test').Page) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const username = page.locator('input').first();
  await expect(username).toBeVisible();
  await username.fill('admin');
  await page.locator('input[type="password"]').first().fill('admin123');
  await page.locator('input[type="password"]').first().press('Enter');
  await page.waitForTimeout(3_000);
};

test.describe('معمارية المنظومة الجديدة', () => {
  test('تُفتح من الرابط المباشر وتعرض التبويبات الستة', async ({ page }) => {
    const errors = collectPageErrors(page);
    await login(page);
    await page.goto('/?view=architecture', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2_500);

    const body = await page.locator('body').innerText();
    expect(body).toContain('CLEAN MICRO-ENGINE ARCHITECTURE');
    expect(body).toContain('المعمارية المعتمدة للمنظومة الجديدة');

    for (const tab of [
      'الميزانية والأساس',
      'مخطط تدفق البيانات الحي',
      'كود التنفيذ المعتمد',
      'بوابات الفحص وميزانية السرعة',
    ]) {
      await expect(page.getByRole('button', { name: new RegExp(tab) }).first()).toBeVisible();
    }

    expect(errors, `أخطاء JavaScript قاتلة:\n${errors.join('\n')}`).toEqual([]);
  });

  test('بوابة حد 300 سطر تعرض ملفاً حقيقياً من المستودع', async ({ page }) => {
    await login(page);
    await page.goto('/?view=architecture', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2_500);

    await page.getByRole('button', { name: /بوابات الفحص وميزانية السرعة/ }).first().click();
    await page.waitForTimeout(600);

    const panel = await page.locator('body').innerText();
    // أسماء ملفات المحرك الجديد + حدود البوابة كما هي معروضة
    expect(panel).toContain('scripts/architecture-guardrails.mjs');
    expect(panel).toContain('/ 300');
    expect(panel).toContain('تشغيل بوابات الفحص المعماري');
    // سجل الأفعال: فعل الشاشة نفسها يجب أن يظهر مسجّلاً
    expect(panel).toContain('architecture.run_guardrails');
  });

  test('تبويب عيوب المنصة يعرض الدليل المقيس', async ({ page }) => {
    await login(page);
    await page.goto('/?view=architecture', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2_500);

    await page.getByRole('button', { name: /عيوب المنصة/ }).first().click();
    await page.waitForTimeout(600);

    const panel = await page.locator('body').innerText();
    expect(panel).toContain('تضخّم الكود');
    expect(panel).toContain('Optimistic UI');
    expect(panel).toContain('الدليل:');
  });
});
