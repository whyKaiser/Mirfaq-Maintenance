import { useSearch } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { useLanguage } from '@/context/LanguageContext';

interface MonthlyReport {
  year: number;
  month: number;
  organization: { name: string; crNumber?: string | null; phone?: string | null; city: string; brandColor: string };
  summary: {
    total: number;
    pending: number;
    inProgress: number;
    completed: number;
    urgent: number;
  };
  byCategory: { category: string; count: number }[];
  byProperty: { propertyName: string; total: number; completed: number }[];
  requests: {
    id: string;
    title: string;
    category: string;
    status: string;
    priority: string;
    residentName: string | null;
    unitNumber: string | null;
    propertyName: string | null;
    technicianName: string | null;
    createdAt: string;
  }[];
}

type MonthlyApi = { org: MonthlyReport['organization']; period:{year:number;month:number}; stats:MonthlyReport['summary'] & {byCategory:Record<string,number>}; requests:MonthlyReport['requests'] };
function adaptMonthlyReport(raw: MonthlyApi): MonthlyReport {
  const propertyCounts = new Map<string,{propertyName:string;total:number;completed:number}>();
  for (const request of raw.requests) {
    const name=request.propertyName ?? '—'; const current=propertyCounts.get(name) ?? {propertyName:name,total:0,completed:0};
    current.total++; if(request.status === 'مكتملة') current.completed++; propertyCounts.set(name,current);
  }
  return {year:raw.period.year,month:raw.period.month,organization:raw.org,summary:raw.stats,byCategory:Object.entries(raw.stats.byCategory).map(([category,count])=>({category,count})),byProperty:[...propertyCounts.values()],requests:raw.requests};
}

const MONTH_AR = [
  '', 'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

export default function PrintMonthly() {
  const { language } = useLanguage();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const year = params.get('year') ?? String(new Date().getFullYear());
  const month = params.get('month') ?? String(new Date().getMonth() + 1);

  const { data, isLoading, isError } = useQuery<MonthlyReport>({
    queryKey: ['/api/reports/monthly', year, month],
    queryFn: () =>
      fetch(`/api/reports/monthly?year=${year}&month=${month}`, { credentials: 'include' })
        .then(async r => { if (!r.ok) throw new Error('Failed'); return adaptMonthlyReport(await r.json() as MonthlyApi); }),
    retry: false,
  });

  if (isLoading) return (
    <div className="flex items-center justify-center min-h-screen font-sans" dir={language === 'en' ? 'ltr' : 'rtl'}>
      <p className="text-muted-foreground">{language === 'en' ? 'Loading monthly report…' : 'جارٍ تحميل التقرير الشهري…'}</p>
    </div>
  );

  if (isError || !data) return (
    <div className="flex items-center justify-center min-h-screen font-sans" dir={language === 'en' ? 'ltr' : 'rtl'}>
      <p className="text-destructive">{language === 'en' ? 'Could not load the report.' : 'تعذّر تحميل التقرير'}</p>
    </div>
  );

  const { organization, summary, byCategory, byProperty, requests } = data;
  const monthName = MONTH_AR[Number(month)] ?? '';

  if (language === 'en') {
    const status:Record<string,string>={'معلّقة':'Pending','قيد التنفيذ':'In progress','مكتملة':'Completed'};
    const categories:Record<string,string>={'تكييف':'HVAC','سباكة':'Plumbing','كهرباء':'Electrical','أخرى':'Other'};
    const monthLabel=new Intl.DateTimeFormat('en',{month:'long',year:'numeric'}).format(new Date(Number(year),Number(month)-1,1));
    return <main dir="ltr" className="mx-auto max-w-5xl space-y-5 bg-white p-8 text-sm text-slate-900"><style>{'@media print { .no-print { display:none!important } @page { margin:1.5cm; size:A4 landscape } }'}</style><div className="no-print flex gap-2"><button onClick={()=>window.print()} className="rounded bg-teal-700 px-4 py-2 text-white">Print / export PDF</button><button onClick={()=>window.close()} className="rounded border px-4 py-2">Close</button></div><header className="flex justify-between"><h1 className="text-2xl font-bold" dir="auto">{organization.name}</h1><div><p>Monthly report</p><strong>{monthLabel}</strong></div></header><div className="grid grid-cols-5 gap-2">{[['Total',summary.total],['Pending',summary.pending],['In progress',summary.inProgress],['Completed',summary.completed],['Urgent',summary.urgent]].map(([label,value])=><div key={label} className="rounded bg-slate-50 p-3"><p className="text-xl font-bold">{value}</p><p>{label}</p></div>)}</div><div className="grid grid-cols-2 gap-4"><section><h2 className="font-bold">By category</h2>{byCategory.length===0?<p>No data.</p>:byCategory.map(c=><p key={c.category}>{categories[c.category] || c.category}: {c.count}</p>)}</section><section><h2 className="font-bold">By property</h2>{byProperty.length===0?<p>No data.</p>:byProperty.map(p=><p key={p.propertyName}><span dir="auto">{p.propertyName}</span> · {p.completed}/{p.total} completed</p>)}</section></div><section><h2 className="font-bold">Reports ({requests.length})</h2><p>Report titles and names are shown as originally recorded.</p><div className="overflow-x-auto"><table className="w-full border-collapse text-left"><thead><tr>{['Title','Category','Status','Priority','Property / unit','Resident','Technician','Date'].map(h=><th key={h} className="border p-2">{h}</th>)}</tr></thead><tbody>{requests.map(r=><tr key={r.id}><td className="border p-2" dir="auto">{r.title}</td><td className="border p-2">{categories[r.category] || r.category}</td><td className="border p-2">{status[r.status] || r.status}</td><td className="border p-2">{r.priority === 'عاجل'?'Urgent':'Normal'}</td><td className="border p-2" dir="auto">{r.propertyName || '—'} · {r.unitNumber || '—'}</td><td className="border p-2" dir="auto">{r.residentName || '—'}</td><td className="border p-2" dir="auto">{r.technicianName || '—'}</td><td className="border p-2">{new Intl.DateTimeFormat('en',{dateStyle:'medium'}).format(new Date(r.createdAt))}</td></tr>)}</tbody></table>{requests.length===0 && <p>No reports this month.</p>}</div></section><p className="text-center text-xs text-slate-500">Mirfaq · {monthLabel}</p></main>;
  }

  return (
    <div className="font-sans p-8 max-w-4xl mx-auto text-sm" dir="rtl">
      <style>{`
        @media print {
          body { margin: 0; }
          .no-print { display: none !important; }
          @page { margin: 1.5cm; size: A4 landscape; }
        }
        body { background: white; color: #0f172a; }
        .divider { border-top: 1px solid #e2e8f0; margin: 1rem 0; }
      `}</style>

      {/* Print button */}
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
          <p className="text-slate-500 text-xs mt-0.5">{organization.city}{organization.phone ? ` · ${organization.phone}` : ''}</p>
        </div>
        <div className="text-left">
          <p className="text-xs text-slate-500 mb-1">التقرير الشهري</p>
          <p className="font-bold text-slate-900 text-base">{monthName} {year}</p>
        </div>
      </div>

      <div className="divider" />

      {/* Summary KPIs */}
      <div className="grid grid-cols-5 gap-3 mb-6">
        {[
          { label: 'إجمالي البلاغات', value: summary.total, color: 'text-slate-900' },
          { label: 'معلّقة', value: summary.pending, color: 'text-amber-700' },
          { label: 'قيد التنفيذ', value: summary.inProgress, color: 'text-blue-700' },
          { label: 'مكتملة', value: summary.completed, color: 'text-emerald-700' },
          { label: 'عاجلة', value: summary.urgent, color: 'text-red-700' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-slate-50 rounded-xl p-3 text-center">
            <p className={`text-3xl font-bold ${color}`}>{value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* By category + by property */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">حسب التصنيف</p>
          <div className="bg-slate-50 rounded-xl overflow-hidden">
            {byCategory.map((c, i) => (
              <div key={c.category} className={`flex items-center justify-between px-3 py-2 ${i > 0 ? 'border-t border-slate-200' : ''}`}>
                <span className="text-sm text-slate-700">{c.category}</span>
                <span className="font-bold text-slate-900">{c.count}</span>
              </div>
            ))}
            {byCategory.length === 0 && <p className="text-xs text-slate-400 px-3 py-3">لا توجد بيانات</p>}
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">حسب العقار</p>
          <div className="bg-slate-50 rounded-xl overflow-hidden">
            {byProperty.map((p, i) => (
              <div key={p.propertyName} className={`flex items-center justify-between px-3 py-2 ${i > 0 ? 'border-t border-slate-200' : ''}`}>
                <span className="text-sm text-slate-700 truncate flex-1 ml-2">{p.propertyName}</span>
                <span className="text-xs text-slate-500 flex-shrink-0">{p.completed}/{p.total} مكتملة</span>
              </div>
            ))}
            {byProperty.length === 0 && <p className="text-xs text-slate-400 px-3 py-3">لا توجد بيانات</p>}
          </div>
        </div>
      </div>

      <div className="divider" />

      {/* Full request table */}
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
        تفاصيل البلاغات ({requests.length})
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-slate-100">
              {['#', 'العنوان', 'التصنيف', 'الحالة', 'الأولوية', 'العقار / الوحدة', 'الساكن', 'الفني', 'التاريخ'].map(h => (
                <th key={h} className="px-2 py-2 text-right font-semibold text-slate-600 border border-slate-200 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {requests.map((r, i) => (
              <tr key={r.id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                <td className="px-2 py-1.5 border border-slate-200 text-slate-500">{i + 1}</td>
                <td className="px-2 py-1.5 border border-slate-200 font-medium max-w-xs truncate">{r.title}</td>
                <td className="px-2 py-1.5 border border-slate-200 text-slate-600">{r.category}</td>
                <td className="px-2 py-1.5 border border-slate-200">
                  <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${
                    r.status === 'مكتملة' ? 'bg-emerald-100 text-emerald-800' :
                    r.status === 'قيد التنفيذ' ? 'bg-blue-100 text-blue-800' :
                    'bg-amber-100 text-amber-800'
                  }`}>{r.status}</span>
                </td>
                <td className="px-2 py-1.5 border border-slate-200">
                  {r.priority === 'عاجل' && <span className="text-red-700 font-semibold">عاجل</span>}
                  {r.priority !== 'عاجل' && <span className="text-slate-500">عادي</span>}
                </td>
                <td className="px-2 py-1.5 border border-slate-200 text-slate-600">{r.propertyName ?? '—'} · {r.unitNumber ?? '—'}</td>
                <td className="px-2 py-1.5 border border-slate-200 text-slate-600">{r.residentName ?? '—'}</td>
                <td className="px-2 py-1.5 border border-slate-200 text-slate-600">{r.technicianName ?? '—'}</td>
                <td className="px-2 py-1.5 border border-slate-200 text-slate-500" dir="ltr" style={{ direction: 'rtl' }}>
                  {new Date(r.createdAt).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric' })}
                </td>
              </tr>
            ))}
            {requests.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-4 text-center text-slate-400">لا توجد بلاغات في هذا الشهر</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="divider mt-6" />
      <p className="text-center text-xs text-slate-400 mt-3">
        مِرفق — تقرير {monthName} {year} — مُنشأ في {new Date().toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' })}
      </p>
    </div>
  );
}
