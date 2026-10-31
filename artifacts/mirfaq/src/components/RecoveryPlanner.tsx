import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../context/LanguageContext';

type RecoveryMode = 'mock' | 'real_model';
type RecoveryTrace = { tool: string; state: string; reason?: string; technicianId?: string };
type RecoveryResult = { state: string; mode: string; trace: RecoveryTrace[]; savedState?: string; receiptConfirmed?: boolean };
type SavedAttempt = { key: string; revision: number; mode: RecoveryMode; state: string };
export type RecoveryPlannerProps = { orderId: string; revision: number; blocked: boolean; onRefresh: () => Promise<void> };

const isUncertain = (state: string) => ['unknown', 'inconsistent', 'planning', 'running', 'in_progress', 'already_attempted', 'pending'].includes(state);
const attemptSlot = (orderId: string) => `mirfaq-recovery-attempt:${orderId}`;
function storedAttempt(orderId: string): SavedAttempt | null {
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(attemptSlot(orderId)) || 'null');
    if (!parsed || typeof parsed !== 'object') return null;
    const value = parsed as Partial<SavedAttempt>;
    return typeof value.key === 'string' && /^[A-Za-z0-9_-]{16,80}$/.test(value.key) && Number.isSafeInteger(value.revision) && (value.mode === 'mock' || value.mode === 'real_model') && typeof value.state === 'string' ? value as SavedAttempt : null;
  } catch { return null; }
}
function resultFrom(value: unknown): RecoveryResult {
  if (!value || typeof value !== 'object') throw new Error('invalid_response');
  const result = value as Record<string, unknown>;
  if (typeof result.state !== 'string' || typeof result.mode !== 'string') throw new Error('invalid_response');
  const trace = Array.isArray(result.trace) ? result.trace.slice(0, 20).flatMap(item => {
    if (!item || typeof item !== 'object' || typeof item.tool !== 'string' || typeof item.state !== 'string') return [];
    return [{tool:item.tool, state:item.state, ...(typeof item.reason === 'string' ? {reason:item.reason} : {}), ...(typeof item.technicianId === 'string' ? {technicianId:item.technicianId} : {})}];
  }) : [];
  return {state:result.state, mode:result.mode, trace, ...(typeof result.savedState === 'string' ? {savedState:result.savedState} : {}), receiptConfirmed:result.receiptConfirmed === true};
}

/** A scripted simulation is explicit. Live recovery stays disabled unless the server enables it. */
export function RecoveryPlanner({ orderId, revision, blocked, onRefresh }: RecoveryPlannerProps) {
  const { language } = useLanguage();
  const en = language === 'en';
  const [liveEnabled, setLiveEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [attempt, setAttempt] = useState<SavedAttempt | null>(() => storedAttempt(orderId));
  const [result, setResult] = useState<RecoveryResult | null>(() => {
    const saved = storedAttempt(orderId);
    return saved && isUncertain(saved.state) ? {state:'unknown', mode:saved.mode, trace:[]} : null;
  });
  const [error, setError] = useState<'storage' | 'unknown' | 'read' | 'refresh' | null>(null);
  useEffect(() => {
    let active = true;
    setLiveEnabled(false);
    fetch('/api/agent/demo/recovery-capabilities', {credentials:'include'})
      .then(async response => response.ok ? response.json() as Promise<unknown> : null)
      .then(value => { if(active) setLiveEnabled(!!value && typeof value === 'object' && 'liveEnabled' in value && value.liveEnabled === true); })
      .catch(() => { if(active) setLiveEnabled(false); });
    return () => { active = false; };
  }, [orderId]);

  const text = (code: string) => {
    const labels: Record<string, [string,string]> = {
      read_recovery_context:['Read recovery facts','قراءة حقائق التعافي'],
      propose_recovery_plan:['Propose and validate recovery','اقتراح التعافي والتحقق منه'],
      execute_recovery:['Execute validated recovery','تنفيذ التعافي المعتمد'],
      read_recovery_result:['Read saved result','قراءة النتيجة المحفوظة'],
      finish_recovery:['Finish with verified evidence','إنهاء المسار بالأدلة المتحققة'],
      ready:['Ready after server validation','جاهز بعد تحقق الخادم'],
      read:['Facts read','قُرئت الحقائق'],
      completed:['Completed','اكتمل'],
      failed:['Attempt failed; review required','فشلت المحاولة؛ تلزم المراجعة'],
      reassigned:['Reassigned and verified','أعيد الإسناد والتحقق'],
      verified:['Verified saved state','حالة محفوظة متحقق منها'],
      manager_review:['Manager review required','تحتاج مراجعة المسؤول'],
      review:['Review required','تحتاج مراجعة'],
      rejected:['Proposal rejected','رُفض الاقتراح'],
      denied:['Not authorized','غير مصرح'],
      forbidden:['Authorization required','يلزم تفويض'],
      not_found:['No saved result found','لا توجد نتيجة محفوظة'],
      not_executed:['No execution recorded','لا يوجد تنفيذ مسجل'],
      stale:['State changed; review required','تغيرت الحالة؛ تلزم المراجعة'],
      unknown:['Outcome unknown; inspect saved state','النتيجة غير مؤكدة؛ افحص الحالة المحفوظة'],
      inconsistent:['Saved records disagree; review required','السجلات المحفوظة غير متطابقة؛ تلزم المراجعة'],
      planning:['Planning already started; read its saved state','بدأ التخطيط مسبقًا؛ اقرأ حالته المحفوظة'],
      running:['Attempt in progress','المحاولة قيد التنفيذ'],
      in_progress:['Attempt in progress; read its saved state','المحاولة قيد التنفيذ؛ اقرأ حالتها المحفوظة'],
      already_attempted:['Recovery already attempted; inspect the saved attempt','جرت محاولة التعافي مسبقًا؛ افحص المحاولة المحفوظة'],
      pending:['Attempt pending','المحاولة معلقة'],
      key_conflict:['Attempt key conflicts with previous inputs','مفتاح المحاولة يتعارض مع مدخلات سابقة'],
      recorded_absence:['Recorded technician absence','غياب فني مسجل'],
      no_eligible_candidate:['No eligible alternative','لا يوجد بديل مؤهل'],
      requires_manager:['Manager action is needed','يلزم إجراء من المسؤول'],
      manager_action_required:['This blocker requires manager action','هذا العائق يتطلب إجراء المسؤول'],
      candidate_and_policy_validated:['Candidate and policy independently validated','تم التحقق مستقلًا من الفني والسياسة'],
      candidate_not_eligible:['Candidate no longer eligible','الفني غير مؤهل حاليًا'],
      report_or_assignment_changed:['Report or assignment changed','تغير البلاغ أو الإسناد'],
      report_too_long:['Report exceeds the demo limit','البلاغ يتجاوز حد التجربة'],
      risk_requires_manager:['Risk requires manager review','الخطر يتطلب مراجعة المسؤول'],
      asset_or_issue_requires_manager:['Asset or issue needs manager review','الأصل أو العطل يحتاج مراجعة المسؤول'],
      policy_invalid:['Policy is invalid','السياسة غير صالحة'],
      delegation_required:['Demo delegation is required','يلزم التفويض التجريبي'],
      authorization_required:['Current manager authorization is required','يلزم تفويض مسؤول ساري'],
      order_not_found:['Order is unavailable','الأمر غير متاح'],
      order_changed:['Order version changed','تغيرت نسخة الأمر'],
      candidate_scan_limit:['Candidate scan limit reached','تم بلوغ حد فحص الفنيين'],
      conflicting_plan:['Plan fields conflict','حقول الخطة متعارضة'],
      unsupported_claim:['Proposal is not supported by observed facts','الاقتراح غير مدعوم بالحقائق المقروءة'],
      context_changed:['Facts changed; refresh before planning','تغيرت الحقائق؛ حدّثها قبل التخطيط'],
      live_disabled:['Live recovery is disabled','التعافي بالنموذج الحي معطل'],
    };
    return labels[code]?.[en ? 0 : 1] || (en ? 'Other server result; review the audit.' : 'نتيجة أخرى من الخادم؛ راجع السجل.');
  };
  const modeText = (mode: string) => mode === 'mock' ? (en ? 'Scripted simulation — no AI or model call' : 'محاكاة مبرمجة — دون ذكاء اصطناعي أو طلب نموذج') : mode === 'real_model' ? (en ? 'Real model-assisted recovery' : 'تعافٍ بمساعدة نموذج حقيقي') : (en ? 'Saved attempt — inspect original mode and audit' : 'محاولة محفوظة — راجع وضعها الأصلي وسجلها');
  const uncertain = !!result && isUncertain(result.state) || !!attempt && isUncertain(attempt.state);
  const persist = (next: SavedAttempt) => { sessionStorage.setItem(attemptSlot(orderId),JSON.stringify(next)); setAttempt(next); };

  async function run(mode: RecoveryMode) {
    if (lock.current || !blocked || uncertain || (mode === 'real_model' && !liveEnabled)) return;
    lock.current = true; setBusy(true); setError(null);
    let next:SavedAttempt;
    try {
      const slot = `mirfaq-recovery-key:${orderId}:${revision}:${mode}`;
      const key = sessionStorage.getItem(slot) || `rec_${crypto.randomUUID().replaceAll('-','')}`;
      if (!/^[A-Za-z0-9_-]{16,80}$/.test(key)) throw new Error('invalid_saved_key');
      sessionStorage.setItem(slot,key);
      next = {key,revision,mode,state:'unknown'};
      persist(next); // Save before transmission, including refresh/navigation uncertainty.
    } catch { setError('storage');setBusy(false);lock.current=false;return; }
    try {
      const response = await fetch(`/api/agent/demo/model-recovery/${encodeURIComponent(orderId)}`, {method:'POST',credentials:'include',headers:{'Content-Type':'application/json','Idempotency-Key':next.key},body:JSON.stringify({expectedRevision:revision,mode})});
      const outcome = resultFrom(await response.json());
      setResult(outcome);persist({...next,state:outcome.state});
    } catch {
      setResult({state:'unknown',mode,trace:[]});setError('unknown');
    } finally {
      try { await onRefresh(); } catch { setError(previous => previous || 'refresh'); }
      setBusy(false);lock.current=false;
    }
  }
  async function readAttempt() {
    if(lock.current || !attempt) return;
    lock.current=true;setBusy(true);setError(null);
    try {
      const response=await fetch(`/api/agent/demo/recovery-runs/${encodeURIComponent(attempt.key)}`,{credentials:'include'});
      const outcome=resultFrom(await response.json());
      setResult(outcome);
      // A missing/denied read is not proof that an earlier in-flight write did not happen.
      const resolved = ['reassigned','manager_review','verified'].includes(outcome.state);
      persist({...attempt,state:isUncertain(attempt.state)&&!resolved?'unknown':outcome.state});
      await onRefresh();
    } catch { setError('read'); }
    finally {setBusy(false);lock.current=false;}
  }

  const button='rounded border border-teal-700 bg-white px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50';
  return <section className="mt-3 space-y-2 rounded border border-slate-300 bg-slate-50 p-3" aria-label={en?'Recovery planner':'مخطط التعافي'} aria-busy={busy} dir={en?'ltr':'rtl'}>
    <h3 className="font-semibold">{en?'Recovery planning with server validation':'تخطيط التعافي مع تحقق الخادم'}</h3>
    <p className="text-sm">{en?'The planner may propose an eligible replacement or manager review. The server rechecks permissions, safety, order version, skill, availability and workload before any change. Assignment does not confirm receipt or repair.':'يمكن للمخطط اقتراح بديل مؤهل أو مراجعة المسؤول. يعيد الخادم فحص الصلاحيات والسلامة ونسخة الأمر والتخصص والتوفر والعبء قبل أي تغيير. الإسناد لا يثبت الاستلام أو الإصلاح.'}</p>
    <div className="flex flex-wrap gap-2">
      <button type="button" className={button} disabled={busy||!blocked||uncertain} onClick={()=>run('mock')}>{busy?(en?'Working…':'جارٍ العمل…'):(en?'Simulate recovery tools (no AI)':'محاكاة أدوات التعافي (دون AI)')}</button>
      <button type="button" className={button} disabled={busy||!blocked||uncertain||!liveEnabled} onClick={()=>run('real_model')}>{en?'Run model-assisted recovery':'تشغيل التعافي بمساعدة النموذج'}</button>
      {attempt && <button type="button" className={button} disabled={busy} onClick={readAttempt}>{en?'Read saved attempt':'قراءة المحاولة المحفوظة'}</button>}
    </div>
    {!liveEnabled && <p className="text-sm text-amber-800">{en?'Live recovery is disabled pending evaluation approval. Simulation is scripted and makes no model call.':'التعافي بالنموذج الحي معطل بانتظار اعتماد التقييم. المحاكاة مبرمجة ولا ترسل طلب نموذج.'}</p>}
    {!blocked && <p className="text-sm">{en?'This order is not blocked; no recovery action is needed.':'الأمر غير متعثر؛ لا يلزم إجراء تعافٍ.'}</p>}
    {uncertain && <p className="text-sm font-medium text-amber-900">{en?'Do not retry this action. Read the saved attempt and review the audit first.':'لا تكرر الإجراء. اقرأ المحاولة المحفوظة وراجع السجل أولًا.'}</p>}
    {error && <p role="alert" className="text-sm text-red-800">{error==='storage'?(en?'Browser storage is unavailable; nothing was sent.':'تخزين المتصفح غير متاح؛ لم يُرسل شيء.'):error==='refresh'?(en?'The result is shown, but the order list could not refresh.':'النتيجة معروضة، لكن تعذر تحديث قائمة الأوامر.'):error==='read'?(en?'The saved attempt could not be read. Keep the action paused.':'تعذرت قراءة المحاولة المحفوظة. أبقِ الإجراء متوقفًا.'):(en?'The response is uncertain. Inspect the saved attempt before any further action.':'الاستجابة غير مؤكدة. افحص المحاولة المحفوظة قبل أي إجراء آخر.')}</p>}
    {result && <div role="status" aria-live="polite" className="space-y-1 text-sm">
      <p className="font-semibold">{modeText(result.mode)}</p>
      <p>{text(result.state)}</p>
      <ol className="list-inside list-decimal space-y-1">{result.trace.map((step,index)=><li key={`${index}-${step.tool}`}>{text(step.tool)}: {text(step.state)}{step.reason&&<> — {text(step.reason)}</>}{step.technicianId&&<> — {en?'Candidate':'الفني المقترح'}: <span dir="ltr" className="break-all">{step.technicianId}</span></>}</li>)}</ol>
      {result.savedState && <p>{en?'Saved-state check':'فحص الحالة المحفوظة'}: {text(result.savedState)}</p>}
      <p>{en?'Technician receipt and physical repair remain unconfirmed.':'استلام الفني والإصلاح الميداني ما زالا غير مؤكدين.'}</p>
    </div>}
  </section>;
}
