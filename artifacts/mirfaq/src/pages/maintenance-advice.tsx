import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { useLanguage } from '@/context/LanguageContext';

type Ticket = { id: string; title: string; description: string; propertyName: string | null; unitNumber: string | null };
type Result = { advice: { state: 'escalate' | 'clarify' | 'review'; priority: string; specialty: string; reasons: string[]; nextSteps: string[] } };
type ModelResult = { interpretation: string; questions: string[]; trace: string[]; model: string; mode: 'mock' | 'real_model'; provider: string; policy: Result['advice'] };
type ClosureResult = { state: 'incomplete' | 'manager_review'; missing: string[]; reportPresent: boolean; completionAttachmentCount: number; caution: string };
const stateLabels = { escalate: 'تصعيد عاجل', clarify: 'يحتاج استيضاحًا', review: 'مقترح للمراجعة' };
const specialtyLabels: Record<string, string> = { hvac: 'تكييف', electrical: 'كهرباء', plumbing: 'سباكة', unknown: 'غير محدد' };

function AdvicePage() {
  const { language } = useLanguage();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [id, setId] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [modelResult, setModelResult] = useState<ModelResult | null>(null);
  const [closure, setClosure] = useState<ClosureResult | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/requests', { credentials: 'include', signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error(); return response.json() as Promise<Ticket[]>; })
      .then(setTickets).catch(e => { if (e.name !== 'AbortError') setError('تعذر تحميل البلاغات.'); });
    return () => controller.abort();
  }, []);
  async function review() {
    if (!id || busy) return;
    setBusy(true); setError(''); setResult(null);
    try {
      const response = await fetch(`/api/maintenance-advice/${encodeURIComponent(id)}`, { credentials: 'include' });
      if (!response.ok) throw new Error();
      setResult(await response.json() as Result);
    } catch { setError('تعذرت قراءة النتيجة.'); } finally { setBusy(false); }
  }
  async function reviewWithModel() {
    if (!id || busy) return;
    setBusy(true); setError(''); setModelResult(null);
    try {
      const response = await fetch(`/api/maintenance-advice/${encodeURIComponent(id)}/model`, { method: 'POST', credentials: 'include' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'تعذر تشغيل النموذج');
      setModelResult(body as ModelResult);
    } catch (e) { setError(e instanceof Error ? e.message : 'تعذر تشغيل النموذج'); } finally { setBusy(false); }
  }
  async function reviewClosure() {
    if (!id || busy) return;
    setBusy(true); setError(''); setClosure(null);
    try {
      const response = await fetch(`/api/maintenance-advice/${encodeURIComponent(id)}/closure`, { credentials: 'include' });
      if (!response.ok) throw new Error();
      setClosure(await response.json() as ClosureResult);
    } catch { setError('تعذرت قراءة أدلة الإغلاق.'); } finally { setBusy(false); }
  }
  if (language === 'en') {
    const states = {escalate:'Urgent escalation',clarify:'Clarification required',review:'Suggestion for review'};
    const specialties: Record<string,string> = {hvac:'HVAC',electrical:'Electrical',plumbing:'Plumbing',unknown:'Unknown'};
    const messages: Record<string,string> = {
      'يتضمن الوصف مؤشر خطر محتمل يحتاج تقييمًا بشريًا عاجلًا.':'The description contains a potential hazard requiring urgent human review.',
      'أحِل البلاغ إلى المسؤول فورًا واتبع إجراءات السلامة المعتمدة لدى الجهة.':'Refer the report to the responsible manager and follow the organization’s safety procedures.',
      'لا تُنفّذ أو تُسند تلقائيًا قبل مراجعة الخطر.':'Do not automatically execute or assign before risk review.',
      'الوصف لا يكفي لتحديد المشكلة والتخصص بأمان.':'The description does not establish the problem and specialty safely.',
      'اطلب وصف العطل وموقعه والأصل المتأثر وأثره وأي خطر محتمل.':'Ask about the problem, location, asset, impact and potential hazards.',
      'اقتراح مبني على كلمات في الوصف وليس تشخيصًا أو تقييمًا مكتملًا للمخاطر.':'This is a keyword-based suggestion, not a diagnosis or a complete risk assessment.',
      'تحقق من الأصل والموقع والأثر والخطر والتكرار وتوفر الفني قبل الإسناد.':'Check asset, location, impact, risk, duplicates and technician availability before assignment.',
      'الأولوية غير محددة حتى تُراجع سياسة الجهة والأثر.':'Priority remains undetermined until the organization’s policy and impact are reviewed.',
    };
    const original = (text:string) => <><span>{messages[text] || 'Original response:'}</span> <span dir="auto" className="text-sm text-slate-600">{text}</span></>;
    const button='rounded border border-teal-700 px-4 py-2 text-teal-800 disabled:opacity-50';
    return <main dir="ltr" className="min-h-screen bg-slate-50 p-6 text-slate-900"><div className="mx-auto max-w-3xl space-y-5"><Link href="/manager" className="text-teal-700 underline">← Manager dashboard</Link><h1 className="text-2xl font-bold">Preliminary report review</h1><p className="rounded bg-amber-50 p-4">Default mode uses limited rules, not an AI agent. It does not create or assign an order and may miss hazards; a manager must review the report.</p><label className="block" htmlFor="ticket-en">Report</label><select id="ticket-en" className="w-full rounded border p-3" value={id} disabled={busy} onChange={e=>{setId(e.target.value);setResult(null);setModelResult(null);setClosure(null);}}><option value="">Select report</option>{tickets.map(t=><option key={t.id} value={t.id}>{t.title} — {t.propertyName} / {t.unitNumber}</option>)}</select><div className="flex flex-wrap gap-2"><button className={button} disabled={!id || busy} onClick={review}>Review with rules</button><button className={button} disabled={!id || busy} onClick={reviewWithModel}>Optional model review</button><button className={button} disabled={!id || busy} onClick={reviewClosure}>Screen closure evidence</button></div><p className="text-sm">The optional model requires separate authorization and can consume API credit; synthetic data only.</p>{error && <div role="alert">The request could not be confirmed.<p dir="auto">{error}</p></div>}{result && <section className="space-y-2 rounded border bg-white p-4" aria-live="polite"><h2 className="font-bold">{states[result.advice.state]}</h2><p>Suggested specialty: {specialties[result.advice.specialty] || result.advice.specialty} · Priority: {result.advice.priority === 'urgent' ? 'Urgent review' : 'Undetermined'}</p>{result.advice.reasons.map(x=><p key={x}>{original(x)}</p>)}<h3 className="font-bold">Next steps</h3>{result.advice.nextSteps.map(x=><p key={x}>{original(x)}</p>)}</section>}{modelResult && <section className="rounded border bg-white p-4"><h2 className="font-bold">Model interpretation for human review</h2><p>Mode: {modelResult.mode === 'mock'?'Mock':'Real model'} · {modelResult.provider}</p><p>Original model output: <span dir="auto">{modelResult.interpretation}</span></p>{modelResult.questions.map(q=><p key={q} dir="auto">{q}</p>)}<p>Independent rule check: {states[modelResult.policy.state]}</p><p>No assignment or closure was performed.</p></section>}{closure && <section className="rounded border bg-white p-4"><h2 className="font-bold">{closure.state === 'incomplete'?'Closure evidence incomplete':'Manager review required'}</h2><p>Technician report: {closure.reportPresent?'Present':'Missing'} · Attachments: {closure.completionAttachmentCount}</p><p>Original missing-evidence details:</p>{closure.missing.map(x=><p key={x} dir="auto">{x}</p>)}<p>Automated screening does not inspect attachment content or establish a field repair.</p></section>}</div></main>;
  }
  return <main dir="rtl" className="min-h-screen bg-slate-50 p-6 text-slate-900">
    <div className="mx-auto max-w-3xl space-y-5">
      <Link href="/manager" className="text-teal-700 underline">العودة للوحة المدير</Link>
      <h1 className="text-2xl font-bold">مراجعة أولية للبلاغ</h1>
      <p className="rounded-lg bg-amber-50 p-4">الوضع الافتراضي: قواعد ثابتة فقط. هذه قواعد تجريبية محدودة وليست وكيل ذكاء اصطناعي. لا تنشئ أمر عمل ولا تسند فنيًا، وقد تفوت مؤشرات الخطر؛ المسؤول يراجع كل بلاغ.</p>
      <label className="block font-medium" htmlFor="ticket">البلاغ</label>
      <select id="ticket" disabled={busy} className="w-full rounded border bg-white p-3" value={id} onChange={e => { setId(e.target.value); setResult(null); setModelResult(null); setClosure(null); }}>
        <option value="">اختر بلاغًا</option>
        {tickets.map(t => <option key={t.id} value={t.id}>{t.title} — {t.propertyName} / {t.unitNumber}</option>)}
      </select>
      <button type="button" className="rounded bg-teal-700 px-5 py-3 text-white disabled:opacity-50" disabled={!id || busy} onClick={review}>{busy ? 'جارٍ الفحص…' : 'اعرض المراجعة'}</button>
      <button type="button" className="mr-3 rounded border border-teal-700 px-5 py-3 text-teal-700 disabled:opacity-50" disabled={!id || busy} onClick={reviewWithModel}>تجربة النموذج الاختيارية</button>
      <button type="button" className="mr-3 rounded border border-teal-700 px-5 py-3 text-teal-700 disabled:opacity-50" disabled={!id || busy} onClick={reviewClosure}>فحص أدلة الإغلاق</button>
      <p className="text-sm">تجربة النموذج تتطلب إعدادًا منفصلًا ومصرحًا به، وهي للبيانات الاصطناعية فقط. قد تستهلك رصيد API.</p>
      {error && <p role="alert" className="text-red-700">{error}</p>}
      {result && <section aria-live="polite" className="space-y-3 rounded-xl border bg-white p-5">
        <h2 className="text-xl font-bold">{stateLabels[result.advice.state]}</h2>
        <p>التخصص المقترح: {specialtyLabels[result.advice.specialty]}</p>
        <p>الأولوية: {result.advice.priority === 'urgent' ? 'عاجلة للمراجعة' : 'غير محددة'}</p>
        {result.advice.reasons.map(x => <p key={x}>{x}</p>)}
        <h3 className="font-bold">الخطوة التالية</h3>
        <ul className="list-inside list-disc">{result.advice.nextSteps.map(x => <li key={x}>{x}</li>)}</ul>
      </section>}
      {modelResult && <section aria-live="polite" className="space-y-3 rounded-xl border bg-white p-5"><h2 className="font-bold">تفسير النموذج للمراجعة البشرية</h2><p>الوضع: {modelResult.mode === 'mock' ? 'محاكاة' : 'نموذج حقيقي'} — {modelResult.provider}</p><p>{modelResult.interpretation}</p><ul className="list-inside list-disc">{modelResult.questions.map(q => <li key={q}>{q}</li>)}</ul><p className="font-bold">فحص القواعد المستقل: {stateLabels[modelResult.policy.state]}</p>{modelResult.policy.reasons.map(reason => <p key={reason}>{reason}</p>)}<p className="text-sm">أدوات القراءة: {modelResult.trace.join(' ← ')}. النموذج: {modelResult.model}. لم يُنفّذ إسناد أو إغلاق.</p></section>}
      {closure && <section aria-live="polite" className="space-y-3 rounded-xl border bg-white p-5"><h2 className="font-bold">{closure.state === 'incomplete' ? 'أدلة الإغلاق غير مكتملة' : 'بانتظار مراجعة المسؤول'}</h2><p>تعليق الفني المسند: {closure.reportPresent ? 'موجود' : 'غير موجود'}؛ عدد مرفقات الإكمال: {closure.completionAttachmentCount}</p><ul className="list-inside list-disc">{closure.missing.map(item => <li key={item}>{item}</li>)}</ul><p>{closure.caution}</p></section>}
    </div>
  </main>;
}
export default function MaintenanceAdvicePage() { return <ProtectedRoute allowedRoles={['manager']}><AdvicePage /></ProtectedRoute>; }
