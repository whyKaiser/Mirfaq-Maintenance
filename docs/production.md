# دليل تشغيل مِرفق في الإنتاج

هذا الدليل يغطي نقل المنصة من العرض التجريبي المحلي إلى تشغيل فعلي مع عملاء.

## 1. متغيرات البيئة

انسخ `artifacts/api-server/.env.example` إلى `.env` واضبط:

| المتغير | الوصف |
| --- | --- |
| `MIRFAQ_DB_URL` | رابط قاعدة البيانات (SQLite للتجربة، PostgreSQL للإنتاج). |
| `SESSION_SECRET` | قيمة عشوائية لا تقل عن 32 حرفًا: `openssl rand -hex 32`. |
| `APP_ORIGINS` | نطاقات المتصفح المسموح لها، مفصولة بفواصل. |
| `PORT` | منفذ خادم الـ API. |
| `NOTIFY_WEBHOOK_URL` | اختياري: رابط يستقبل الإشعارات الصادرة (بريد/واتساب/Slack). |
| `NOTIFY_LOG` | اختياري: `1` لتسجيل الإشعارات الصادرة في اللوق. |
| `DISABLE_PLAN_REMINDERS` | اختياري: `1` لتعطيل مؤقّت تذكيرات الصيانة الوقائية. |

الخادم يرفض الإقلاع في الإنتاج إذا كان `SESSION_SECRET` أقصر من 32 حرفًا.

## 2. قاعدة البيانات: SQLite أو PostgreSQL

المنصة تدعم القاعدتين من نفس الكود. الفرق الوحيد هو رابط `MIRFAQ_DB_URL`:

| البيئة | الرابط | ملاحظة |
| --- | --- | --- |
| تطوير محلي | `file:./.data/mirfaq-local.db` | يعمل بدون تثبيت أي خدمة. |
| إنتاج | `postgresql://USER:PASS@HOST:5432/mirfaq` | الموصى به مع عملاء فعليين. |

المخطط المرجعي هو `prisma/schema.prisma` (SQLite). مخطط PostgreSQL في
`prisma/postgres/schema.prisma` **مولَّد منه آليًا** ولا يُحرَّر يدويًا، فلا يمكن
أن يختلف الاثنان. أوامر Prisma تختار المخطط المناسب حسب `MIRFAQ_DB_URL`.

### التشغيل على PostgreSQL

```bash
cd artifacts/api-server
export MIRFAQ_DB_URL="postgresql://USER:PASS@HOST:5432/mirfaq"

pnpm run db:pg:deploy    # يطبّق الهجرات على القاعدة
pnpm run db:generate     # يولّد عميل Prisma المناسب للمزوّد
pnpm run db:pg:seed      # اختياري: بيانات تجريبية
pnpm run build && pnpm run start
```

### تعديل المخطط لاحقًا

1. عدّل `prisma/schema.prisma` فقط.
2. أنشئ هجرة SQLite كالمعتاد في `prisma/migrations/`.
3. حدّث مخطط PostgreSQL وأنشئ هجرته:
   ```bash
   pnpm run db:pg:sync
   SHADOW_DATABASE_URL="postgresql://…/mirfaq_shadow" pnpm run db:pg:migrate \
     > prisma/postgres/migrations/$(date -u +%Y%m%d%H%M%S)_change/migration.sql
   ```
   (`db:pg:migrate` يطبع فرق SQL بين الهجرات الحالية والمخطط الجديد.)

الـ CI يمنع الانحراف: يتحقق أن المخطط المولَّد مطابق، وأن هجرات PostgreSQL تغطي
المخطط بالكامل (`prisma migrate diff --exit-code`)، ويشغّل كل الاختبارات على
PostgreSQL 16 حقيقي إضافة إلى SQLite.

### ملاحظات على الفروق

- كل المبالغ مخزّنة بالهللات كأعداد صحيحة، فلا فرق في التقريب بين المزوّدين.
- أعمدة `DateTime` تصبح `timestamp(3)` — لا تغيير مطلوب في الكود.
- SQLite يسمح بكاتب واحد في اللحظة؛ هذا سبب كافٍ وحده للانتقال عند وجود عملاء.

## 3. المرفقات والتخزين

`src/lib/storage.ts` يكتب الملفات في `<cwd>/uploads/`. عند وجود أكثر من خادم أو
عند الحاجة لنسخ احتياطي منفصل، انقل الملفات إلى تخزين كائنات متوافق مع S3:
استبدل دوال الحفظ والقراءة في ذلك الملف فقط — بقية الكود يتعامل مع مسار الملف
كسلسلة نصية.

## 4. النسخ الاحتياطي

```bash
MIRFAQ_DB_URL="postgresql://…" scripts/ops/backup-db.sh /var/backups/mirfaq
```

السكربت يتعرف على SQLite وPostgreSQL تلقائيًا. شغّله من cron يوميًا، وانقل الناتج
إلى تخزين خارج الخادم — النسخة بجانب قاعدة البيانات لا تحمي من فقد الجهاز.

## 5. الفحص الآلي

```bash
pnpm run typecheck   # فحص الأنواع في كل الحزم
pnpm run test        # اختبارات الـ API (vitest + supertest)
pnpm run build       # بناء الخادم والواجهة
```

الاختبارات تنشئ قاعدة SQLite مؤقتة وتطبّق عليها الهجرات، ثم تحذفها — لا تلمس
قاعدة بياناتك المحلية.

لتشغيل نفس الاختبارات على PostgreSQL:

```bash
cd artifacts/api-server
TEST_DATABASE_URL="postgresql://…/mirfaq_test" pnpm run test
```

يُعاد إنشاء الـ schema قبل كل تشغيل، فوجّهه لقاعدة اختبار فقط ولا توجّهه أبدًا
لقاعدة فيها بيانات فعلية.

`.github/workflows/ci.yml` يشغّل على كل دفعة و pull request: الفحص والاختبارات
والبناء على SQLite، ثم الاختبارات كاملة على PostgreSQL 16 مع فحص انحراف المخطط
والهجرات.

## 6. الأمان التشغيلي

- شغّل المنصة خلف HTTPS دائمًا: الجلسة تستخدم كوكي `secure` في الإنتاج.
- `APP_ORIGINS` يجب أن يحتوي نطاقات الإنتاج فقط.
- صفحة البلاغ العامة (QR) محمية بحدود طلبات؛ راجع `src/routes/public-units.ts`
  قبل رفع الحدود.
- دوّر `SESSION_SECRET` عند الاشتباه في تسريب — يؤدي ذلك لإخراج كل المستخدمين.
