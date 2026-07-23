# مِرفق

منصة عربية لإدارة بلاغات صيانة العقارات في السعودية. تربط مدير العقار والساكن والفني من تسجيل البلاغ حتى توثيق الإنجاز وإصدار التقارير.

## ما الذي يعمل؟

- إدارة عدة عقارات ووحدات من حساب منشأة واحد.
- حسابات وصلاحيات مستقلة للمدير والساكن والفني.
- إنشاء البلاغات وإسنادها والتعليق عليها وتحديث حالتها.
- رفع صور أولية وصور إتمام.
- أوامر عمل وتقارير شهرية قابلة للطباعة.
- إعدادات وهوية خاصة بكل منشأة وسجل عمليات.
- رمز QR قابل للتنزيل لكل وحدة.
- صفحة أسعار ونموذج فعلي لطلبات العروض.

## التشغيل محليًا

المتطلبات: Node.js 20 أو أحدث وpnpm 11.

```bash
pnpm install
pnpm --filter @workspace/api-server run db:push
pnpm --filter @workspace/api-server run db:seed
pnpm run dev
```

افتح `http://localhost:5173`.

الحسابات التجريبية وكلمة المرور `Demo123!`:

- `manager@mirfaq.sa`
- `resident@mirfaq.sa`
- `technician@mirfaq.sa`

## الفحص والبناء

```bash
pnpm run typecheck
pnpm run build
```

## متغيرات الإنتاج

انسخ `artifacts/api-server/.env.example` واضبط:

- `MIRFAQ_DB_URL`
- `SESSION_SECRET` بقيمة عشوائية لا تقل عن 32 حرفًا.
- `APP_ORIGINS` بأسماء النطاقات المسموحة مفصولة بفواصل.
- `PORT`

SQLite والتخزين المحلي مناسبان للعرض التجريبي والبدايات. عند وجود عملاء فعليين، انقل قاعدة البيانات إلى PostgreSQL والمرفقات إلى تخزين كائنات متوافق مع S3.

## التقنية

React، TypeScript، Vite، Tailwind CSS، Express، Prisma، SQLite، TanStack Query وpnpm workspaces.
