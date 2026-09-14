# Visual Design Validator (VDV)

أداة التحقق البصري التلقائي للتصميم لـ OpenCode — تسد الفجوة بين الكود والنتيجة البصرية عبر حلقة تغذية راجعة مغلقة.

## الميزات

- **تكامل المتصفح**: يفتح Chromium عبر Playwright، يضبط حجم الشاشة، يلتقط لقطات شاشة تلقائياً
- **فحص الـ DOM**: يكتشف التداخلات، تجاوز الحدود، أهداف اللمس الصغيرة، النصوص البديلة المفقودة، المسافات غير المتساوية، صراعات الـ z-index
- **LLM Feedback Loop**: يولد سياق تحليل كامل للذكاء الاصطناعي من بيانات الفحص
- **التصحيح التلقائي**: يطبق الإصلاحات المقترحة على ملفات CSS/HTML مع نسخ احتياطية واستعادة

## البنية

```
visual-design-validator/
├── package.json          # التبعيات (Playwright, Zod, TypeScript)
├── tsconfig.json         # إعدادات TypeScript
├── opencode.json         # تفعيل الـ plugin والمهارة
├── src/
│   ├── plugin.ts         # نقطة الدخول — تسجيل الأدوات (Tools)
│   ├── browser.ts        # إدارة المتصفح (Playwright)
│   ├── dom-inspector.ts  # فحص عناصر الصفحة وتراصفها
│   ├── llm-feedback.ts   # بناء سياق النموذج وحلقة التغذية الراجعة
│   ├── auto-fixer.ts     # تطبيق إصلاحات CSS/HTML التلقائية
│   └── index.ts          # إعادة تصدير الواجهة العامة
├── skill/
│   └── visual-design-validator/SKILL.md
├── screenshots/          # لقطات الشاشة الملتقطة
└── dist/                 # مخرجات الترجمة
```

## التثبيت

```bash
npm install
npx playwright install chromium   # تثبيت متصفح Chromium
npm run build                     # ترجمة TypeScript (اختياري)
```

## التثبيت في OpenCode

أضف في `opencode.json` الخاص بمشروعك:

```json
{
  "plugin": ["path/to/visual-design-validator/src/plugin.ts"],
  "skills": { "paths": ["path/to/visual-design-validator/skill"] }
}
```

ثم أعد تشغيل opencode.

> ملاحظة: يستخدم opencode محمل jiti المدمج لتشغيل ملفات `.ts` مباشرة، لذلك لا حاجة لإعادة الترجمة لتحديث المصدر.

## الأدوات المسجلة

| الأداة | الوصف |
|--------|-------|
| `visual-validate` | فحص كامل: متصفح + لقطة + DOM + توليد تحليل |
| `visual-fix` | تطبيق إصلاحات من تحليل LLM |
| `visual-screenshot` | لقطات شاشة بأحجام متعددة |
| `dom-inspect` | فحص DOM سريع فقط |

## أحجام الشاشة

- `desktop`: 1920×1080
- `laptop`: 1366×768
- `tablet`: 768×1024
- `mobile`: 375×812

## حلقة التغذية الراجعة المغلقة

```
فحص بصري -> تقرير DOM -> تحليل LLM -> تطبيق إصلاحات -> إعادة فحص -> حتى 100%
```

## مثال

```
visual-validate url="http://localhost:3000"
```

سيقوم بـ:
1. تشغيل المتصفح والانتقال إلى الصفحة
2. التقاط لقطة شاشة بحجم سطح المكتب
3. فحص الـ DOM بحثاً عن التداخلات والمسافات والمشاكل الأخرى
4. إرجاع تقرير كامل مع سياق تحليل جاهز للنموذج

## الاختبارات

```bash
npm run build
node test-smoke.mjs      # اختبار الوحدات الأساسية
node test-browser.mjs    # اختبار حي مع Chromium
```