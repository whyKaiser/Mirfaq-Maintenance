import { useParams } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { useLanguage } from '@/context/LanguageContext';

interface WorkOrderReport {
  request: {
    id: string;
    title: string;
    description: string;
    status: string;
    priority: string;
    category: string;
    createdAt: string;
    updatedAt: string;
  };
  unit: { number: string; floor: number } | null;
  property: { name: string; address: string } | null;
  resident: { name: string; email: string; phone?: string | null } | null;
  technician: { name: string; phone?: string | null; specialty: string } | null;
  organization: { name: string; crNumber?: string | null; phone?: string | null; city: string; brandColor: string };
  comments: { id: string; authorName: string; content: string; createdAt: string }[];
  attachments: { id: string; fileName: string; attachmentType: string }[];
}

type WorkOrderApi = { org: WorkOrderReport['organization']; request: WorkOrderReport['request'] & { propertyName:string;propertyAddress:string;unitNumber:string;unitFloor:number;residentName:string;residentPhone?:string|null;technicianName:string|null;technicianPhone:string|null;technicianSpecialty:string|null;comments:Array<{authorName:string;content:string;createdAt:string}>;attachments:WorkOrderReport['attachments'] } };
function adaptWorkOrder(raw:WorkOrderApi):WorkOrderReport {
  const r=raw.request;
  return {organization:raw.org,request:r,property:{name:r.propertyName,address:r.propertyAddress},unit:{number:r.unitNumber,floor:r.unitFloor},resident:{name:r.residentName,email:'',phone:r.residentPhone},technician:r.technicianName ? {name:r.technicianName,phone:r.technicianPhone,specialty:r.technicianSpecialty || ''} : null,comments:r.comments.map((comment,index)=>({...comment,id:String(index)})),attachments:r.attachments};
}

export default function PrintWorkOrder() {
  const { language } = useLanguage();
  const { requestId } = useParams<{ requestId: string }>();

  const { data, isLoading, isError } = useQuery<WorkOrderReport>({
    queryKey: ['/api/reports/work-order', requestId],
    queryFn: () =>
      fetch(`/api/reports/work-order/${requestId}`, { credentials: 'include' })
        .then(async r => { if (!r.ok) throw new Error('Not found'); return adaptWorkOrder(await r.json() as WorkOrderApi); }),
    retry: false,
  });

  if (isLoading) return (
    <div className="flex items-center justify-center min-h-screen font-sans" dir={language === 'en' ? 'ltr' : 'rtl'}>
      <p className="text-muted-foreground">{language === 'en' ? 'Loading work order…' : 'جارٍ تحميل أمر العمل…'}</p>
    </div>
  );

  if (isError || !data) return (
    <div className="flex items-center justify-center min-h-screen font-sans" dir={language === 'en' ? 'ltr' : 'rtl'}>
      <p className="text-destructive">{language === 'en' ? 'Could not load the report.' : 'تعذّر تحميل البلاغ'}</p>
    </div>
  );

  const { request, unit, property, resident, technician, organization, comments, attachments } = data;

  const STATUS_AR: Record<string, string> = {
    'معلّقة': 'معلّقة', 'قيد التنفيذ': 'قيد التنفيذ', 'مكتملة': 'مكتملة',
  };
  const PRIORITY_AR: Record<string, string> = { 'عاجل': 'عاجل 🔴', 'عادي': 'عادي' };

  if (language === 'en') {
    const status: Record<string,string>={'معلّقة':'Pending','قيد التنفيذ':'In progress','مكتملة':'Completed'};
    const priority: Record<string,string>={'عاجل':'Urgent','عادي':'Normal'};
    const category: Record<string,string>={'تكييف':'HVAC','سباكة':'Plumbing','كهرباء':'Electrical','أخرى':'Other'};
    const date=(value:string)=>new Intl.DateTimeFormat('en',{dateStyle:'long'}).format(new Date(value));
    return <main dir="ltr" className="mx-auto max-w-3xl space-y-5 bg-white p-8 text-sm text-slate-900"><style>{'@media print { .no-print { display:none!important } @page { margin:1.5cm } }'}</style><div className="no-print flex gap-2"><button className="rounded bg-teal-700 px-4 py-2 text-white" onClick={()=>window.print()}>Print / export PDF</button><button className="rounded border px-4 py-2" onClick={()=>window.close()}>Close</button></div><header className="flex justify-between"><div><h1 className="text-2xl font-bold" dir="auto">{organization.name}</h1><p dir="auto">{organization.city} {organization.phone || ''}</p></div><div><p>Work order</p><strong>{request.id.slice(-8).toUpperCase()}</strong><p>Created: {date(request.createdAt)}</p></div></header><section className="border-t pt-4"><p>Status: {status[request.status] || request.status} · Priority: {priority[request.priority] || request.priority} · Category: {category[request.category] || request.category}</p><h2 className="mt-2 text-xl font-bold" dir="auto">{request.title}</h2><p>Original report:</p><p dir="auto">{request.description}</p></section><div className="grid grid-cols-3 gap-3"><section className="rounded bg-slate-50 p-3"><h3 className="font-bold">Location</h3><p dir="auto">{property?.name || '—'}</p><p dir="auto">{property?.address || ''}</p><p>Unit {unit?.number || '—'} · Floor {unit?.floor ?? '—'}</p></section><section className="rounded bg-slate-50 p-3"><h3 className="font-bold">Resident</h3><p dir="auto">{resident?.name || '—'}</p><p>{resident?.phone || ''}</p><p>{resident?.email || ''}</p></section><section className="rounded bg-slate-50 p-3"><h3 className="font-bold">Assigned technician</h3><p dir="auto">{technician?.name || 'Not assigned'}</p><p dir="auto">{category[technician?.specialty || ''] || technician?.specialty || ''}</p><p>{technician?.phone || ''}</p></section></div><section><h3 className="font-bold">Comments ({comments.length})</h3>{comments.length===0?<p>No comments.</p>:comments.map(c=><article key={c.id} className="mt-2 rounded bg-slate-50 p-2"><p><span dir="auto">{c.authorName}</span> · {date(c.createdAt)}</p><p dir="auto">{c.content}</p></article>)}</section><section><h3 className="font-bold">Attachments ({attachments.length})</h3>{attachments.length===0?<p>No attachments.</p>:attachments.map(a=><p key={a.id}>📎 {a.fileName} · {a.attachmentType === 'completion'?'Completion':'Initial report'}</p>)}<p>Attachment contents are not inspected by the agent.</p></section><div className="grid grid-cols-2 gap-6 border-t pt-6"><p>Technician signature: ____________________</p><p>Manager signature: ____________________</p></div><p className="text-center text-xs text-slate-500">Generated by Mirfaq · {date(new Date().toISOString())}</p></main>;
  }

  return (
    <div className="font-sans p-8 max-w-3xl mx-auto text-sm" dir="rtl">
      <style>{`
        @media print {
          body { margin: 0; }
          .no-print { display: none !important; }
          @page { margin: 1.5cm; }
        }
        body { background: white; color: #0f172a; }
        .divider { border-top: 1px solid #e2e8f0; margin: 1rem 0; }
      `}</style>

      {/* Print button (hidden on print) */}
      <div className="no-print mb-6 flex gap-3">
        <button
          onClick={() => window.print()}
          className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          طباعة / تصدير PDF
        </button>
        <button onClick={() => window.close()} className="px-4 py-2 rounded-xl border border-border text-sm hover:bg-muted transition-colors">
          إغلاق
        </button>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div
            className="inline-flex items-center justify-center w-14 h-14 rounded-2xl text-white font-bold text-2xl mb-3"
            style={{ backgroundColor: organization.brandColor }}
          >م</div>
          <h1 className="text-2xl font-bold text-slate-900">{organization.name}</h1>
          <p className="text-slate-500 text-xs mt-0.5">{organization.city}{organization.phone ? ` · ${organization.phone}` : ''}{organization.crNumber ? ` · س.ت ${organization.crNumber}` : ''}</p>
        </div>
        <div className="text-left">
          <p className="text-xs text-slate-500 mb-1">أمر العمل</p>
          <p className="font-bold text-slate-900 font-mono text-sm">{request.id.slice(-8).toUpperCase()}</p>
          <p className="text-xs text-slate-500 mt-2">تاريخ الإنشاء</p>
          <p className="text-xs font-medium">{new Date(request.createdAt).toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>
      </div>

      <div className="divider" />

      {/* Request info */}
      <div className="mb-5">
        <div className="flex items-center gap-3 mb-2">
          <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${
            request.status === 'مكتملة' ? 'bg-emerald-100 text-emerald-800' :
            request.status === 'قيد التنفيذ' ? 'bg-blue-100 text-blue-800' :
            'bg-amber-100 text-amber-800'
          }`}>{STATUS_AR[request.status] ?? request.status}</span>
          <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${
            request.priority === 'عاجل' ? 'bg-red-100 text-red-800' : 'bg-slate-100 text-slate-700'
          }`}>{PRIORITY_AR[request.priority] ?? request.priority}</span>
          <span className="text-xs text-slate-500">{request.category}</span>
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">{request.title}</h2>
        <p className="text-slate-600 leading-relaxed">{request.description}</p>
      </div>

      {/* Grid: location + resident + technician */}
      <div className="grid grid-cols-3 gap-4 mb-5">
        <div className="bg-slate-50 rounded-xl p-3">
          <p className="text-xs text-slate-400 font-medium mb-1.5">الموقع</p>
          <p className="font-semibold text-slate-800">{property?.name ?? '—'}</p>
          <p className="text-xs text-slate-500 mt-0.5">{property?.address ?? ''}</p>
          <p className="text-xs text-slate-500 mt-0.5">وحدة {unit?.number ?? '—'} · الطابق {unit?.floor ?? '—'}</p>
        </div>
        <div className="bg-slate-50 rounded-xl p-3">
          <p className="text-xs text-slate-400 font-medium mb-1.5">الساكن</p>
          <p className="font-semibold text-slate-800">{resident?.name ?? '—'}</p>
          {resident?.phone && <p className="text-xs text-slate-500 mt-0.5" dir="ltr">{resident.phone}</p>}
          <p className="text-xs text-slate-500 mt-0.5" dir="ltr">{resident?.email ?? ''}</p>
        </div>
        <div className="bg-slate-50 rounded-xl p-3">
          <p className="text-xs text-slate-400 font-medium mb-1.5">الفني المكلف</p>
          <p className="font-semibold text-slate-800">{technician?.name ?? 'لم يُعيَّن'}</p>
          {technician?.specialty && <p className="text-xs text-slate-500 mt-0.5">{technician.specialty}</p>}
          {technician?.phone && <p className="text-xs text-slate-500 mt-0.5" dir="ltr">{technician.phone}</p>}
        </div>
      </div>

      {/* Comments */}
      {comments.length > 0 && (
        <div className="mb-5">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">التعليقات ({comments.length})</p>
          <div className="space-y-2">
            {comments.map(c => (
              <div key={c.id} className="bg-slate-50 rounded-xl px-3 py-2.5">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-semibold text-slate-700">{c.authorName}</p>
                  <p className="text-xs text-slate-400">{new Date(c.createdAt).toLocaleDateString('ar-SA')}</p>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">{c.content}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Attachments list */}
      {attachments.length > 0 && (
        <div className="mb-5">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">المرفقات ({attachments.length})</p>
          <div className="flex flex-wrap gap-2">
            {attachments.map(a => (
              <span key={a.id} className="text-xs bg-slate-100 px-2.5 py-1 rounded-lg text-slate-600">
                📎 {a.fileName}
                {a.attachmentType === 'completion' ? ' (إتمام)' : ' (إبلاغ)'}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="divider" />

      {/* Signature boxes */}
      <div className="grid grid-cols-2 gap-8 mt-6">
        <div>
          <p className="text-xs text-slate-400 mb-8">توقيع الفني</p>
          <div className="border-b border-slate-300 pt-6" />
          <p className="text-xs text-slate-500 mt-1">{technician?.name ?? '—'}</p>
        </div>
        <div>
          <p className="text-xs text-slate-400 mb-8">توقيع المدير</p>
          <div className="border-b border-slate-300 pt-6" />
          <p className="text-xs text-slate-500 mt-1">{organization.name}</p>
        </div>
      </div>

      <div className="divider mt-8" />
      <p className="text-center text-xs text-slate-400 mt-3">
        مُنشأ بواسطة مِرفق — {new Date().toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' })}
      </p>
    </div>
  );
}
