import { useEffect } from 'react';
import { useParams } from 'wouter';
import { useQuery } from '@tanstack/react-query';

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

export default function PrintWorkOrder() {
  const { requestId } = useParams<{ requestId: string }>();

  const { data, isLoading, isError } = useQuery<WorkOrderReport>({
    queryKey: ['/api/reports/work-order', requestId],
    queryFn: () =>
      fetch(`/api/reports/work-order/${requestId}`, { credentials: 'include' })
        .then(r => { if (!r.ok) throw new Error('Not found'); return r.json() as Promise<WorkOrderReport>; }),
    retry: false,
  });

  useEffect(() => {
    if (!data) return;
    const timer = setTimeout(() => window.print(), 600);
    return () => clearTimeout(timer);
  }, [data]);

  if (isLoading) return (
    <div className="flex items-center justify-center min-h-screen font-sans" dir="rtl">
      <p className="text-muted-foreground">جارٍ تحميل أمر العمل…</p>
    </div>
  );

  if (isError || !data) return (
    <div className="flex items-center justify-center min-h-screen font-sans" dir="rtl">
      <p className="text-destructive">تعذّر تحميل البلاغ</p>
    </div>
  );

  const { request, unit, property, resident, technician, organization, comments, attachments } = data;

  const STATUS_AR: Record<string, string> = {
    'معلّقة': 'معلّقة', 'قيد التنفيذ': 'قيد التنفيذ', 'مكتملة': 'مكتملة',
  };
  const PRIORITY_AR: Record<string, string> = { 'عاجل': 'عاجل 🔴', 'عادي': 'عادي' };

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
