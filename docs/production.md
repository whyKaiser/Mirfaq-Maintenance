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

## 2. الانتقال إلى PostgreSQL

SQLite مناسب للعرض التجريبي فقط: كتابة واحدة في اللحظة، والملف مرتبط بالجهاز.
للانتقال:

1. في `artifacts/api-server/prisma/schema.prisma` غيّر:
   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("MIRFAQ_DB_URL")
   }
   ```
2. احذف مجلد `prisma/migrations` وأعد توليد هجرة أولى لـ PostgreSQL:
   ```bash
   cd artifacts/api-server
   MIRFAQ_DB_URL="postgresql://…" pnpm exec prisma migrate dev --name init_postgres
   ```
   (الهجرات الحالية مكتوبة بلهجة SQLite ولا تعمل على PostgreSQL.)
3. انقل البيانات القائمة إن وُجدت، ثم شغّل `prisma migrate deploy` على خادم الإنتاج.

نقاط تتغير مع PostgreSQL:

- أعمدة `DateTime` تصبح `timestamptz` — لا تغيير مطلوب في الكود.
- كل المبالغ مخزّنة بالهللات كأعداد صحيحة، فلا مشكلة تقريب.

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
قاعدة بياناتك المحلية. نفس الأوامر الثلاثة تُشغَّل في GitHub Actions عبر
`.github/workflows/ci.yml` على كل دفعة و pull request.

## 6. الأمان التشغيلي

- شغّل المنصة خلف HTTPS دائمًا: الجلسة تستخدم كوكي `secure` في الإنتاج.
- `APP_ORIGINS` يجب أن يحتوي نطاقات الإنتاج فقط.
- صفحة البلاغ العامة (QR) محمية بحدود طلبات؛ راجع `src/routes/public-units.ts`
  قبل رفع الحدود.
- دوّر `SESSION_SECRET` عند الاشتباه في تسريب — يؤدي ذلك لإخراج كل المستخدمين.
