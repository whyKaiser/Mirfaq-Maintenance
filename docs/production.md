# دليل تشغيل مِرفق في الإنتاج

هذا الدليل يغطي نقل المنصة من العرض التجريبي المحلي إلى تشغيل فعلي مع عملاء.

## 0. النشر السريع

الطريقة الأقصر: حاوية واحدة تقدّم الـ API والواجهة معًا (`SERVE_CLIENT=1`)، مع
PostgreSQL بجانبها.

```bash
cp .env.docker.example .env
# اضبط SESSION_SECRET و POSTGRES_PASSWORD و APP_ORIGINS بقيم حقيقية
docker compose up -d --build

# مرة واحدة بعد أول تشغيل وبعد كل تحديث يغيّر المخطط:
docker compose exec app node ./scripts/prisma-schema.mjs migrate deploy
```

الواجهة والـ API على نفس المنفذ، فلا حاجة لنشر منفصل للواجهة ولا لموجّه أمام
خدمتين.

### شرطان لا يعملان بدونهما

**١. HTTPS إلزامي.** كوكي الجلسة في الإنتاج عليه `Secure`، فالمتصفح يتجاهله على
HTTP عادي — النتيجة أن تسجيل الدخول ينجح ظاهريًا ثم يبدو كل طلب كأنه غير مسجَّل.
شغّل المنصة خلف موجّه ينهي TLS (Caddy أو nginx أو موجّه المزوّد) ويمرّر
`X-Forwarded-Proto`. الخادم يثق بالموجّه الأول (`trust proxy = 1`).

**٢. `APP_ORIGINS` يجب أن يطابق نطاقك.** أي أصل غير مذكور يُرفض من CORS.

### التحديث لاحقًا

```bash
git pull
docker compose up -d --build
docker compose exec app node ./scripts/prisma-schema.mjs migrate deploy
```

### تشغيل أكثر من نسخة

قبل زيادة عدد النسخ لازم أمران:

- `STORAGE_PROVIDER=s3` — القرص المحلي غير مشترك بين النسخ (القسم 3).
- **مخزن جلسات مشترك.** الجلسات حاليًا في ذاكرة العملية، فمع أكثر من نسخة يفقد
  المستخدم جلسته كلما وصل طلبه لنسخة أخرى. الحل إما تثبيت الجلسة على نسخة واحدة
  في الموجّه (sticky sessions)، أو استبدال مخزن الجلسات بـ Redis في
  `src/app.ts`. نسخة واحدة تكفي لأحجام كثيرة، وهذا خيار مقبول للبداية.

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
| `SERVE_CLIENT` | `1` لتقديم الواجهة المبنية من نفس الخادم (افتراضي في صورة Docker). |
| `CLIENT_DIST_PATH` | مسار الواجهة المبنية عند اختلافه عن ترتيب المستودع. |
| `STORAGE_PROVIDER` | `local` (افتراضي) أو `s3` — راجع القسم 3. |

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

صور البلاغات تُخزَّن عبر مشغّلين خلف واجهة واحدة، يُختار بـ `STORAGE_PROVIDER`:

| القيمة | السلوك |
| --- | --- |
| `local` (افتراضي) | ملفات على قرص الخادم في `<cwd>/uploads/`. |
| `s3` | أي حاوية متوافقة مع S3: AWS S3، Cloudflare R2، MinIO، Backblaze B2. |

**متى ينبغي الانتقال إلى S3:** عند تشغيل أكثر من خادم. القرص المحلي غير مشترك
بينها، فالصورة المرفوعة على خادم تظهر مفقودة عند طلبها من خادم آخر. كذلك عند
الحاجة لنسخ احتياطي للمرفقات مستقل عن الخادم.

### الإعداد

```bash
STORAGE_PROVIDER=s3
S3_BUCKET=mirfaq-attachments
S3_REGION=me-south-1
S3_ACCESS_KEY_ID=…
S3_SECRET_ACCESS_KEY=…
# لمزوّد غير AWS:
S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com
S3_PREFIX=attachments
```

`S3_FORCE_PATH_STYLE=1` يُفعَّل تلقائيًا عند ضبط `S3_ENDPOINT`، وهو ما تتوقعه
MinIO وأغلب البوابات المستضافة ذاتيًا.

### نقل المرفقات الحالية

شغّل هذا **قبل** تحويل `STORAGE_PROVIDER` إلى `s3`، وإلا ستبدو الملفات القديمة
مفقودة:

```bash
cd artifacts/api-server
MIRFAQ_DB_URL=… S3_BUCKET=… S3_REGION=… \
S3_ACCESS_KEY_ID=… S3_SECRET_ACCESS_KEY=… \
pnpm run storage:migrate
```

السكربت لا يعدّل أي صف في قاعدة البيانات — مفتاح التخزين لا يتغيّر — ويتخطى
الكائنات الموجودة مسبقًا، فإعادة تشغيله بعد فشل جزئي آمنة. الملفات المحلية تبقى
مكانها؛ أضف `--delete-local` لحذفها بعد التأكد أن التطبيق يقدّم المرفقات من
الحاوية.

### الحاوية يجب أن تبقى خاصة

المرفقات تُقدَّم دائمًا عبر `GET /api/files/:key`، وهذا المسار يتحقق أن الطالب
ينتمي للمؤسسة وله صلاحية على البلاغ. جعل الحاوية عامة أو استخدام روابط موقّعة
مباشرة يلتف على هذا الفحص ويكشف صور بلاغات مؤسسات أخرى لمن يعرف المفتاح.

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

- شغّل المنصة خلف HTTPS دائمًا: الجلسة تستخدم كوكي `Secure` في الإنتاج، ولن
  تعمل على HTTP (راجع القسم 0).
- `APP_ORIGINS` يجب أن يحتوي نطاقات الإنتاج فقط.
- صفحة البلاغ العامة (QR) محمية بحدود طلبات؛ راجع `src/routes/public-units.ts`
  قبل رفع الحدود.
- دوّر `SESSION_SECRET` عند الاشتباه في تسريب — يؤدي ذلك لإخراج كل المستخدمين.
