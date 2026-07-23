import { useEffect, useState } from 'react';
import { Link, useParams } from 'wouter';
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  ChevronLeft,
  ClipboardCheck,
  Home,
  Loader2,
  MapPin,
  Send,
  ShieldCheck,
  Wrench,
} from 'lucide-react';

type PublicUnit = {
  orgName: string;
  propertyName: string;
  unitId: string;
  unitNumber: string;
};

type ReportForm = {
  name: string;
  phone: string;
  title: string;
  description: string;
  category: string;
  priority: string;
};

const CATEGORIES = ['كهرباء', 'سباكة', 'تكييف', 'أخرى'];
const PRIORITIES = [
  { value: 'عادي', label: 'عادي', hint: 'لا يوجد خطر أو ضرر فوري' },
  { value: 'عاجل', label: 'عاجل', hint: 'تسرب، انقطاع، أو خطر يحتاج تدخلاً سريعاً' },
];

const EMPTY_FORM: ReportForm = {
  name: '',
  phone: '',
  title: '',
  description: '',
  category: 'سباكة',
  priority: 'عادي',
};

async function getErrorMessage(response: Response, fallback: string) {
  const body = await response.json().catch(() => null) as { error?: string; message?: string } | null;
  return body?.error ?? body?.message ?? fallback;
}

export default function PublicReportPage() {
  const { token = '' } = useParams<{ token: string }>();
  const [unit, setUnit] = useState<PublicUnit | null>(null);
  const [form, setForm] = useState<ReportForm>(EMPTY_FORM);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    async function loadUnit() {
      setIsLoading(true);
      setLoadError('');
      try {
        const response = await fetch(`/api/public/units/${encodeURIComponent(token)}`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(await getErrorMessage(response, 'تعذر فتح رابط الوحدة'));
        }
        const data = await response.json() as PublicUnit;
        setUnit(data);
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setLoadError(error instanceof Error ? error.message : 'تعذر فتح رابط الوحدة');
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }

    if (token) loadUnit();
    else {
      setLoadError('رابط البلاغ غير صالح');
      setIsLoading(false);
    }

    return () => controller.abort();
  }, [token]);

  function updateField<K extends keyof ReportForm>(key: K, value: ReportForm[K]) {
    setForm(previous => ({ ...previous, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!unit || isSubmitting) return;

    setIsSubmitting(true);
    setSubmitError('');
    try {
      const response = await fetch(`/api/public/units/${encodeURIComponent(token)}/requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          phone: form.phone.trim(),
          title: form.title.trim(),
          description: form.description.trim(),
          category: form.category,
          priority: form.priority,
        }),
      });
      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'تعذر إرسال البلاغ'));
      }
      setIsSuccess(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error: unknown) {
      setSubmitError(error instanceof Error ? error.message : 'تعذر إرسال البلاغ');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main
      dir="rtl"
      className="min-h-screen overflow-hidden bg-[linear-gradient(160deg,hsl(var(--primary)/0.12),hsl(var(--background))_38%,hsl(var(--accent)/0.09))] font-sans"
    >
      <div className="pointer-events-none fixed -right-24 -top-20 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none fixed -bottom-24 -left-20 h-72 w-72 rounded-full bg-accent/10 blur-3xl" />

      <header className="relative border-b border-border/70 bg-card/80 backdrop-blur-lg">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-xl font-bold text-primary-foreground shadow-sm">
              م
            </span>
            <span>
              <strong className="block text-base leading-none">مِرفق</strong>
              <span className="mt-1 block text-[11px] text-muted-foreground">بلاغ صيانة سريع</span>
            </span>
          </Link>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700">
            <ShieldCheck className="h-3.5 w-3.5" />
            رابط آمن
          </span>
        </div>
      </header>

      <div className="relative mx-auto max-w-2xl px-4 py-7 sm:py-10">
        {isLoading ? (
          <section className="flex min-h-[55vh] flex-col items-center justify-center text-center">
            <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Loader2 className="h-7 w-7 animate-spin" />
            </span>
            <h1 className="text-lg font-bold">جاري تجهيز نموذج البلاغ</h1>
            <p className="mt-1 text-sm text-muted-foreground">لحظات ونحدد وحدتك تلقائياً</p>
          </section>
        ) : loadError || !unit ? (
          <section className="mx-auto mt-12 max-w-md rounded-3xl border border-red-200 bg-card p-6 text-center shadow-lg shadow-red-950/5">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-600">
              <AlertCircle className="h-7 w-7" />
            </span>
            <h1 className="mt-4 text-xl font-bold">الرابط غير متاح</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{loadError}</p>
            <p className="mt-1 text-xs text-muted-foreground">اطلب رمز QR جديداً من إدارة العقار.</p>
            <Link
              href="/"
              className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-semibold hover:bg-muted"
            >
              <Home className="h-4 w-4" />
              العودة للرئيسية
            </Link>
          </section>
        ) : isSuccess ? (
          <section className="mx-auto mt-8 max-w-md overflow-hidden rounded-3xl border border-emerald-200 bg-card text-center shadow-xl shadow-emerald-950/5">
            <div className="bg-emerald-50 px-6 py-8">
              <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/20">
                <CheckCircle2 className="h-9 w-9" />
              </span>
              <h1 className="mt-4 text-2xl font-bold text-emerald-900">وصل بلاغك بنجاح</h1>
              <p className="mt-2 text-sm leading-6 text-emerald-800">
                استلمت إدارة {unit.propertyName} البلاغ، وسيتم التواصل معك على الرقم المسجل.
              </p>
            </div>
            <div className="space-y-3 px-6 py-6">
              <div className="flex items-center justify-between rounded-2xl bg-muted/60 px-4 py-3 text-sm">
                <span className="text-muted-foreground">الوحدة</span>
                <strong>{unit.unitNumber}</strong>
              </div>
              <button
                type="button"
                onClick={() => {
                  setForm(previous => ({ ...EMPTY_FORM, name: previous.name, phone: previous.phone }));
                  setIsSuccess(false);
                }}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground hover:bg-primary/90"
              >
                <Wrench className="h-4 w-4" />
                إرسال بلاغ آخر
              </button>
              <Link
                href="/"
                className="flex w-full items-center justify-center gap-1 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                زيارة منصة مِرفق
                <ChevronLeft className="h-4 w-4" />
              </Link>
            </div>
          </section>
        ) : (
          <>
            <section className="mb-5 overflow-hidden rounded-3xl bg-secondary text-secondary-foreground shadow-xl shadow-secondary/10">
              <div className="relative p-5 sm:p-6">
                <div className="absolute -left-8 -top-8 h-28 w-28 rounded-full bg-primary/20" />
                <div className="relative flex items-start gap-4">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10">
                    <Building2 className="h-6 w-6" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs text-secondary-foreground/65">{unit.orgName}</p>
                    <h1 className="mt-1 truncate text-xl font-bold">{unit.propertyName}</h1>
                    <div className="mt-2 flex items-center gap-1.5 text-sm text-secondary-foreground/80">
                      <MapPin className="h-4 w-4" />
                      الوحدة {unit.unitNumber}
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <form onSubmit={handleSubmit} className="rounded-3xl border border-border/80 bg-card p-5 shadow-xl shadow-slate-950/5 sm:p-7">
              <div className="mb-6 flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <ClipboardCheck className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-lg font-bold">وش المشكلة؟</h2>
                  <p className="mt-0.5 text-xs leading-5 text-muted-foreground">اكتب التفاصيل وسيوصل البلاغ مباشرة لإدارة العقار.</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="space-y-1.5">
                    <span className="text-sm font-semibold">الاسم</span>
                    <input
                      value={form.name}
                      onChange={event => updateField('name', event.target.value)}
                      required
                      autoComplete="name"
                      placeholder="اسم مقدم البلاغ"
                      className="w-full rounded-xl border border-input bg-background px-3.5 py-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                    />
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-sm font-semibold">رقم الجوال</span>
                    <input
                      value={form.phone}
                      onChange={event => updateField('phone', event.target.value)}
                      required
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      dir="ltr"
                      pattern="(?:\\+?966|0)?5[0-9]{8}"
                      title="أدخل رقم جوال سعودي صحيح"
                      placeholder="05xxxxxxxx"
                      className="w-full rounded-xl border border-input bg-background px-3.5 py-3 text-right text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                    />
                  </label>
                </div>

                <label className="block space-y-1.5">
                  <span className="text-sm font-semibold">عنوان المشكلة</span>
                  <input
                    value={form.title}
                    onChange={event => updateField('title', event.target.value)}
                    required
                    minLength={3}
                    maxLength={120}
                    placeholder="مثال: تسرب مياه تحت المغسلة"
                    className="w-full rounded-xl border border-input bg-background px-3.5 py-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </label>

                <label className="block space-y-1.5">
                  <span className="text-sm font-semibold">وصف المشكلة</span>
                  <textarea
                    value={form.description}
                    onChange={event => updateField('description', event.target.value)}
                    required
                    minLength={10}
                    maxLength={1000}
                    rows={4}
                    placeholder="متى بدأت؟ وأين تظهر المشكلة بالتحديد؟"
                    className="w-full resize-none rounded-xl border border-input bg-background px-3.5 py-3 text-sm leading-6 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </label>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="space-y-1.5">
                    <span className="text-sm font-semibold">التصنيف</span>
                    <select
                      value={form.category}
                      onChange={event => updateField('category', event.target.value)}
                      className="w-full rounded-xl border border-input bg-background px-3.5 py-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    >
                      {CATEGORIES.map(category => <option key={category}>{category}</option>)}
                    </select>
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-sm font-semibold">الأولوية</span>
                    <select
                      value={form.priority}
                      onChange={event => updateField('priority', event.target.value)}
                      className="w-full rounded-xl border border-input bg-background px-3.5 py-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    >
                      {PRIORITIES.map(priority => (
                        <option key={priority.value} value={priority.value}>{priority.label}</option>
                      ))}
                    </select>
                    <span className="block text-[11px] leading-4 text-muted-foreground">
                      {PRIORITIES.find(priority => priority.value === form.priority)?.hint}
                    </span>
                  </label>
                </div>
              </div>

              {submitError && (
                <div role="alert" className="mt-5 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  {submitError}
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3.5 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 transition hover:bg-primary/90 disabled:cursor-wait disabled:opacity-60"
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {isSubmitting ? 'جاري إرسال البلاغ...' : 'إرسال البلاغ الآن'}
              </button>
              <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-[11px] text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5" />
                تُستخدم بياناتك لمتابعة هذا البلاغ فقط
              </p>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
