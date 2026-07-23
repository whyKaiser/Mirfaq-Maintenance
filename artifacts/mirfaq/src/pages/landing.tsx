import { FormEvent, useState } from 'react';
import { Link } from 'wouter';
import {
  ArrowLeft, BarChart3, Building2, Check, CheckCircle2, Clock3,
  FileText, Home, Menu, MessageSquareText, ShieldCheck, Users, Wrench, X,
} from 'lucide-react';

const features = [
  { icon: MessageSquareText, title: 'بلاغ واضح من أول مرة', text: 'الوحدة، نوع العطل، الأولوية والصور في بلاغ واحد.' },
  { icon: Users, title: 'إسناد ومتابعة الفنيين', text: 'توزيع المهام ومعرفة المتأخر والمنجز بدون اتصالات متكررة.' },
  { icon: BarChart3, title: 'تقارير للإدارة', text: 'مؤشرات فورية وتقارير شهرية وأوامر عمل جاهزة للطباعة.' },
  { icon: ShieldCheck, title: 'صلاحيات منفصلة', text: 'واجهة خاصة للمدير، وأخرى للساكن، وثالثة للفني.' },
  { icon: FileText, title: 'سجل عمليات موثق', text: 'توثيق التغييرات والتعليقات وصور ما قبل وبعد التنفيذ.' },
  { icon: Home, title: 'عقارات ووحدات متعددة', text: 'إدارة المجمعات السكنية والتجارية من حساب واحد.' },
];

const plans = [
  {
    name: 'البداية',
    price: '299',
    note: 'حتى 50 وحدة',
    features: ['مدير واحد', 'بلاغات غير محدودة', 'تقارير أساسية', 'دعم عبر البريد'],
  },
  {
    name: 'الأعمال',
    price: '699',
    note: 'حتى 250 وحدة',
    featured: true,
    features: ['عدة مدراء', 'تقارير وأوامر عمل', 'سجل العمليات', 'تهيئة وهوية المنشأة'],
  },
  {
    name: 'المؤسسات',
    price: 'حسب الاحتياج',
    note: 'أكثر من 250 وحدة',
    features: ['نطاق مخصص', 'تكاملات حسب الطلب', 'تدريب الفريق', 'اتفاقية مستوى خدمة'],
  },
];

type LeadForm = {
  name: string;
  companyName: string;
  phone: string;
  email: string;
  unitsCount: string;
  message: string;
};

const emptyForm: LeadForm = {
  name: '', companyName: '', phone: '', email: '', unitsCount: '', message: '',
};

export default function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [form, setForm] = useState<LeadForm>(emptyForm);
  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [error, setError] = useState('');

  async function submitLead(event: FormEvent) {
    event.preventDefault();
    setStatus('sending');
    setError('');
    try {
      const response = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          unitsCount: form.unitsCount ? Number(form.unitsCount) : undefined,
        }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || 'تعذر إرسال الطلب');
      setForm(emptyForm);
      setStatus('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر إرسال الطلب');
      setStatus('error');
    }
  }

  const scrollTo = (id: string) => {
    setMenuOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-50 border-b border-border/70 bg-background/90 backdrop-blur-xl">
        <div className="container mx-auto flex h-16 items-center justify-between px-4 md:px-6">
          <Link href="/" className="flex items-center gap-2" aria-label="مِرفق">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-xl font-black text-primary-foreground">م</span>
            <span className="text-xl font-black">مِرفق</span>
          </Link>

          <nav className="hidden items-center gap-7 text-sm font-medium md:flex">
            <button onClick={() => scrollTo('features')} className="hover:text-primary">المميزات</button>
            <button onClick={() => scrollTo('workflow')} className="hover:text-primary">كيف يعمل</button>
            <button onClick={() => scrollTo('pricing')} className="hover:text-primary">الأسعار</button>
            <button onClick={() => scrollTo('contact')} className="hover:text-primary">اطلب عرضًا</button>
          </nav>

          <div className="hidden items-center gap-3 md:flex">
            <Link href="/login" className="rounded-xl border px-4 py-2 text-sm font-semibold hover:bg-muted">دخول التجربة</Link>
            <button onClick={() => scrollTo('contact')} className="rounded-xl bg-primary px-5 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90">
              اطلب عرضًا
            </button>
          </div>

          <button className="rounded-lg p-2 md:hidden" onClick={() => setMenuOpen(!menuOpen)} aria-label="القائمة">
            {menuOpen ? <X /> : <Menu />}
          </button>
        </div>
        {menuOpen && (
          <nav className="border-t bg-background p-4 md:hidden">
            <div className="grid gap-2">
              {[
                ['features', 'المميزات'], ['workflow', 'كيف يعمل'], ['pricing', 'الأسعار'], ['contact', 'اطلب عرضًا'],
              ].map(([id, label]) => (
                <button key={id} onClick={() => scrollTo(id)} className="rounded-lg px-4 py-3 text-right hover:bg-muted">{label}</button>
              ))}
              <Link href="/login" className="rounded-lg bg-primary px-4 py-3 text-center font-bold text-primary-foreground">دخول التجربة</Link>
            </div>
          </nav>
        )}
      </header>

      <main>
        <section className="relative overflow-hidden py-20 md:py-28">
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_80%_20%,hsl(var(--primary)/.16),transparent_35%),radial-gradient(circle_at_10%_80%,hsl(var(--accent)/.18),transparent_30%)]" />
          <div className="container mx-auto grid items-center gap-12 px-4 md:grid-cols-2 md:px-6">
            <div>
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-2 text-sm font-semibold text-primary">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                مصمم لإدارة العقارات في السعودية
              </div>
              <h1 className="text-4xl font-black leading-tight md:text-6xl">
                بلاغات الصيانة
                <span className="block text-primary">من الفوضى إلى الإنجاز</span>
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-8 text-muted-foreground">
                مِرفق يجمع مدير العقار والساكن والفني في منصة عربية واحدة؛ من تسجيل البلاغ حتى توثيق الإنجاز والتقرير.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <button onClick={() => scrollTo('contact')} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-7 py-4 font-bold text-primary-foreground shadow-lg shadow-primary/20 hover:-translate-y-0.5">
                  اطلب عرضًا تجريبيًا <ArrowLeft className="h-5 w-5" />
                </button>
                <Link href="/login" className="inline-flex items-center justify-center rounded-xl border bg-card px-7 py-4 font-bold hover:bg-muted">
                  جرّب الحسابات الجاهزة
                </Link>
              </div>
              <div className="mt-7 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
                <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" />بدون بطاقة دفع</span>
                <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" />واجهة عربية كاملة</span>
                <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" />بيانات تجريبية جاهزة</span>
              </div>
            </div>

            <div className="rounded-3xl border bg-card p-4 shadow-2xl shadow-primary/10 md:p-6">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">ملخص الصيانة</p>
                  <h2 className="text-xl font-bold">لوحة المدير</h2>
                </div>
                <div className="rounded-xl bg-primary/10 p-3 text-primary"><Building2 /></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {[
                  ['6', 'إجمالي البلاغات'], ['2', 'قيد التنفيذ'], ['2', 'مكتملة'],
                ].map(([value, label]) => (
                  <div key={label} className="rounded-2xl border bg-background p-4 text-center">
                    <div className="text-2xl font-black text-primary">{value}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{label}</div>
                  </div>
                ))}
              </div>
              <div className="mt-4 space-y-3">
                {[
                  ['تسرب مياه في الحمام الرئيسي', 'عاجل', 'قيد التنفيذ'],
                  ['انخفاض ضغط المياه', 'عادي', 'قيد التنفيذ'],
                  ['عطل كهربائي في المطبخ', 'عادي', 'مكتملة'],
                ].map(([title, priority, state]) => (
                  <div key={title} className="flex items-center justify-between rounded-2xl border p-4">
                    <div className="flex items-center gap-3">
                      <span className="rounded-xl bg-muted p-2"><Wrench className="h-4 w-4" /></span>
                      <div>
                        <p className="text-sm font-bold">{title}</p>
                        <p className="text-xs text-muted-foreground">{priority}</p>
                      </div>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs ${state === 'مكتملة' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'}`}>{state}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="border-y bg-muted/30 py-20">
          <div className="container mx-auto px-4 md:px-6">
            <div className="mx-auto mb-12 max-w-2xl text-center">
              <p className="font-bold text-primary">منصة تشغيل، وليست مجرد نموذج بلاغ</p>
              <h2 className="mt-2 text-3xl font-black md:text-4xl">كل دورة الصيانة في مكان واحد</h2>
            </div>
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {features.map(({ icon: Icon, title, text }) => (
                <article key={title} className="rounded-2xl border bg-card p-6 shadow-sm">
                  <div className="mb-4 inline-flex rounded-xl bg-primary/10 p-3 text-primary"><Icon /></div>
                  <h3 className="text-lg font-bold">{title}</h3>
                  <p className="mt-2 leading-7 text-muted-foreground">{text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="workflow" className="py-20">
          <div className="container mx-auto px-4 md:px-6">
            <div className="mx-auto mb-12 max-w-2xl text-center">
              <h2 className="text-3xl font-black md:text-4xl">ثلاث خطوات واضحة</h2>
              <p className="mt-3 text-muted-foreground">كل مستخدم يرى ما يحتاجه فقط.</p>
            </div>
            <div className="grid gap-6 md:grid-cols-3">
              {[
                ['01', 'الساكن يرفع البلاغ', 'وصف وصور وأولوية من الجوال.'],
                ['02', 'المدير يكلّف الفني', 'اختيار الفني ومتابعة الحالة والتعليقات.'],
                ['03', 'الفني يوثق الإنجاز', 'صور إتمام وسجل كامل وتقرير قابل للطباعة.'],
              ].map(([number, title, text]) => (
                <div key={number} className="relative rounded-2xl border p-7">
                  <span className="text-5xl font-black text-primary/15">{number}</span>
                  <h3 className="mt-3 text-xl font-bold">{title}</h3>
                  <p className="mt-2 text-muted-foreground">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="pricing" className="border-y bg-slate-950 py-20 text-white">
          <div className="container mx-auto px-4 md:px-6">
            <div className="mx-auto mb-12 max-w-2xl text-center">
              <p className="font-bold text-cyan-400">أسعار مبدئية قابلة للتخصيص</p>
              <h2 className="mt-2 text-3xl font-black md:text-4xl">ابدأ حسب حجم محفظتك</h2>
              <p className="mt-3 text-slate-400">الأسعار بالريال السعودي شهريًا ولا تشمل ضريبة القيمة المضافة.</p>
            </div>
            <div className="grid gap-6 lg:grid-cols-3">
              {plans.map((plan) => (
                <article key={plan.name} className={`rounded-3xl border p-7 ${plan.featured ? 'border-cyan-400 bg-cyan-400/10 shadow-xl shadow-cyan-500/10' : 'border-slate-800 bg-slate-900'}`}>
                  {plan.featured && <span className="rounded-full bg-cyan-400 px-3 py-1 text-xs font-black text-slate-950">الأكثر مناسبة</span>}
                  <h3 className="mt-4 text-xl font-bold">{plan.name}</h3>
                  <div className="mt-4 flex items-end gap-2">
                    <span className="text-4xl font-black">{plan.price}</span>
                    {plan.price !== 'حسب الاحتياج' && <span className="mb-1 text-slate-400">ر.س / شهر</span>}
                  </div>
                  <p className="mt-2 text-sm text-slate-400">{plan.note}</p>
                  <ul className="mt-6 space-y-3">
                    {plan.features.map((item) => <li key={item} className="flex gap-2 text-sm"><Check className="h-5 w-5 text-cyan-400" />{item}</li>)}
                  </ul>
                  <button onClick={() => scrollTo('contact')} className={`mt-7 w-full rounded-xl px-4 py-3 font-bold ${plan.featured ? 'bg-cyan-400 text-slate-950' : 'border border-slate-700 hover:bg-slate-800'}`}>
                    اطلب عرضًا
                  </button>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="contact" className="py-20">
          <div className="container mx-auto grid gap-10 px-4 md:grid-cols-[.8fr_1.2fr] md:px-6">
            <div>
              <p className="font-bold text-primary">حوّل الصيانة إلى عملية قابلة للقياس</p>
              <h2 className="mt-2 text-3xl font-black md:text-4xl">اطلب عرضًا تجريبيًا لمنشأتك</h2>
              <p className="mt-4 leading-8 text-muted-foreground">أرسل بياناتك الأساسية، ثم نجهز لك عرضًا يناسب عدد العقارات والوحدات.</p>
              <div className="mt-8 space-y-4">
                <p className="flex items-center gap-3"><Clock3 className="text-primary" />عرض مباشر مدته 20 دقيقة</p>
                <p className="flex items-center gap-3"><Building2 className="text-primary" />تهيئة حسب هوية المنشأة</p>
                <p className="flex items-center gap-3"><ShieldCheck className="text-primary" />لا يلزم إدخال بطاقة دفع</p>
              </div>
            </div>

            <form onSubmit={submitLead} className="rounded-3xl border bg-card p-6 shadow-xl md:p-8" data-testid="lead-form">
              <div className="grid gap-4 sm:grid-cols-2">
                {[
                  ['name', 'الاسم', 'text', true],
                  ['companyName', 'اسم المنشأة', 'text', true],
                  ['phone', 'رقم الجوال', 'tel', true],
                  ['email', 'البريد الإلكتروني', 'email', false],
                  ['unitsCount', 'عدد الوحدات', 'number', false],
                ].map(([key, label, type, required]) => (
                  <label key={String(key)} className="grid gap-2 text-sm font-semibold">
                    {label}
                    <input
                      type={String(type)}
                      required={Boolean(required)}
                      min={type === 'number' ? 1 : undefined}
                      value={form[key as keyof LeadForm]}
                      onChange={(e) => setForm({ ...form, [String(key)]: e.target.value })}
                      className="rounded-xl border bg-background px-4 py-3 font-normal outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    />
                  </label>
                ))}
                <label className="grid gap-2 text-sm font-semibold sm:col-span-2">
                  ملاحظات
                  <textarea value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} rows={3} className="resize-none rounded-xl border bg-background px-4 py-3 font-normal outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
                </label>
              </div>
              {status === 'success' && <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">تم استلام طلبك. سنراجع البيانات ونتواصل معك.</p>}
              {status === 'error' && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-800">{error}</p>}
              <button disabled={status === 'sending'} className="mt-5 w-full rounded-xl bg-primary px-5 py-3.5 font-bold text-primary-foreground disabled:opacity-60" data-testid="submit-lead">
                {status === 'sending' ? 'جارٍ الإرسال…' : 'إرسال طلب العرض'}
              </button>
            </form>
          </div>
        </section>
      </main>

      <footer className="border-t bg-card py-10">
        <div className="container mx-auto flex flex-col items-center justify-between gap-5 px-4 text-center md:flex-row md:px-6">
          <div className="flex items-center gap-2 font-black"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">م</span>مِرفق</div>
          <p className="text-sm text-muted-foreground">منتج سعودي لإدارة عمليات صيانة العقارات</p>
          <p className="text-sm text-muted-foreground">© {new Date().getFullYear()} جميع الحقوق محفوظة</p>
        </div>
      </footer>
    </div>
  );
}
