import { useState } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  LayoutDashboard, Wrench, Users, Settings, LogOut,
  Search, ChevronLeft, Clock, CheckCircle2, RefreshCcw,
  Building2, Home, Plus, Pencil, Trash2, X, AlertTriangle,
} from 'lucide-react';
import {
  useGetDashboardStats,
  useGetRequests,
  useGetTechnicians,
  useUpdateRequest,
  useGetProperties,
  useCreateProperty,
  useUpdateProperty,
  useDeleteProperty,
  useGetUnits,
  useCreateUnit,
  useUpdateUnit,
  useDeleteUnit,
  useLogout,
  getGetRequestsQueryKey,
  getGetPropertiesQueryKey,
  getGetUnitsQueryKey,
  getGetDashboardStatsQueryKey,
} from '@workspace/api-client-react';
import type {
  MaintenanceRequest,
  TechnicianProfile,
  Property,
  Unit,
} from '@workspace/api-client-react';
import { useAuth } from '@/context/AuthContext';
import { ProtectedRoute } from '@/components/ProtectedRoute';

// ─── types ────────────────────────────────────────────────────────────────────

type NavSection = 'dashboard' | 'properties' | 'units' | 'requests' | 'technicians';

interface ResidentUser {
  id: string;
  name: string;
  email: string;
  unitId: string | null;
  unitNumber: string | null;
}

// ─── badge helpers ─────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<string, string> = {
  'معلّقة':      'bg-amber-100 text-amber-800 border-amber-200',
  'قيد التنفيذ': 'bg-blue-100 text-blue-800 border-blue-200',
  'مكتملة':      'bg-emerald-100 text-emerald-800 border-emerald-200',
};
const PRIORITY_STYLE: Record<string, string> = {
  'عاجل': 'bg-red-100 text-red-800 border-red-200',
  'عادي': 'bg-slate-100 text-slate-700 border-slate-200',
};

function StatusBadge({ s }: { s: string }) {
  const icon =
    s === 'معلّقة'      ? <Clock className="w-3 h-3" /> :
    s === 'قيد التنفيذ' ? <RefreshCcw className="w-3 h-3" /> :
    s === 'مكتملة'      ? <CheckCircle2 className="w-3 h-3" /> : null;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_STYLE[s] ?? 'bg-muted text-muted-foreground border-border'}`}>
      {icon}{s}
    </span>
  );
}
function PriorityBadge({ p }: { p: string }) {
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${PRIORITY_STYLE[p] ?? 'bg-muted text-muted-foreground border-border'}`}>
      {p}
    </span>
  );
}

// ─── confirm dialog ────────────────────────────────────────────────────────────

function ConfirmDialog({
  message, onConfirm, onCancel, isPending,
}: { message: string; onConfirm: () => void; onCancel: () => void; isPending?: boolean }) {
  return (
    <div className="fixed inset-0 bg-background/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-sm shadow-xl p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-destructive/10 text-destructive flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <p className="text-sm font-medium leading-snug">{message}</p>
        </div>
        <div className="flex gap-3 pt-1">
          <button
            onClick={onConfirm}
            disabled={isPending}
            className="flex-1 py-2 rounded-xl bg-destructive text-destructive-foreground text-sm font-semibold hover:bg-destructive/90 transition-colors disabled:opacity-60"
          >
            {isPending ? 'جارٍ الحذف…' : 'حذف'}
          </button>
          <button
            onClick={onCancel}
            className="flex-1 py-2 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors"
          >
            إلغاء
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── property modal ────────────────────────────────────────────────────────────

function PropertyModal({
  initial, onSave, onClose, isPending,
}: {
  initial?: Property;
  onSave: (name: string, address: string) => void;
  onClose: () => void;
  isPending: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [address, setAddress] = useState(initial?.address ?? '');
  const isEdit = !!initial;

  return (
    <div className="fixed inset-0 bg-background/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="font-bold">{isEdit ? 'تعديل العقار' : 'إضافة عقار جديد'}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">اسم العقار</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="مثال: مجمع الياسمين السكني"
              className="w-full px-3 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">العنوان</label>
            <input
              value={address}
              onChange={e => setAddress(e.target.value)}
              placeholder="مثال: حي الياسمين، الرياض"
              className="w-full px-3 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </div>
        <div className="flex gap-3 p-5 border-t border-border">
          <button
            onClick={() => { if (name.trim() && address.trim()) onSave(name.trim(), address.trim()); }}
            disabled={isPending || !name.trim() || !address.trim()}
            className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60"
          >
            {isPending ? 'جارٍ الحفظ…' : isEdit ? 'حفظ التغييرات' : 'إضافة العقار'}
          </button>
          <button onClick={onClose} className="px-5 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors">
            إلغاء
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── unit modal ────────────────────────────────────────────────────────────────

function UnitModal({
  initial, residents, onSave, onClose, isPending,
}: {
  initial?: Unit;
  residents: ResidentUser[];
  onSave: (number: string, floor: number, residentId: string | null) => void;
  onClose: () => void;
  isPending: boolean;
}) {
  const [number, setNumber] = useState(initial?.number ?? '');
  const [floor, setFloor] = useState(String(initial?.floor ?? '1'));
  const [residentId, setResidentId] = useState(initial?.residentId ?? '');
  const isEdit = !!initial;

  return (
    <div className="fixed inset-0 bg-background/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="font-bold">{isEdit ? 'تعديل الوحدة' : 'إضافة وحدة جديدة'}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">رقم الوحدة</label>
              <input
                value={number}
                onChange={e => setNumber(e.target.value)}
                placeholder="مثال: 3B"
                className="w-full px-3 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">الطابق</label>
              <input
                type="number"
                value={floor}
                onChange={e => setFloor(e.target.value)}
                min={1}
                className="w-full px-3 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">الساكن (اختياري)</label>
            <select
              value={residentId}
              onChange={e => setResidentId(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">— لم يُسكَّن بعد —</option>
              {residents.map(r => (
                <option
                  key={r.id}
                  value={r.id}
                  disabled={!!r.unitId && r.unitId !== initial?.id}
                >
                  {r.name}{r.unitId && r.unitId !== initial?.id ? ` (مسكَّن في ${r.unitNumber})` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex gap-3 p-5 border-t border-border">
          <button
            onClick={() => {
              if (number.trim() && floor) {
                onSave(number.trim(), parseInt(floor, 10), residentId || null);
              }
            }}
            disabled={isPending || !number.trim() || !floor}
            className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60"
          >
            {isPending ? 'جارٍ الحفظ…' : isEdit ? 'حفظ التغييرات' : 'إضافة الوحدة'}
          </button>
          <button onClick={onClose} className="px-5 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors">
            إلغاء
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── request detail modal ──────────────────────────────────────────────────────

function RequestDetailModal({
  request, technicians, isUpdating, onClose, onUpdate,
}: {
  request: MaintenanceRequest;
  technicians: TechnicianProfile[];
  isUpdating: boolean;
  onClose: () => void;
  onUpdate: (id: string, data: { status?: string; priority?: string; technicianId?: string | null }) => void;
}) {
  const [status, setStatus] = useState(request.status);
  const [priority, setPriority] = useState(request.priority);
  const [technicianId, setTechnicianId] = useState(request.technicianId ?? '');

  return (
    <div className="fixed inset-0 bg-background/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl w-full max-w-lg shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="font-bold text-lg">تفاصيل البلاغ</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <PriorityBadge p={request.priority} />
              <span className="text-xs text-muted-foreground">{request.category}</span>
            </div>
            <h3 className="font-semibold text-base">{request.title}</h3>
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{request.description}</p>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-muted/40 rounded-xl p-3">
              <p className="text-xs text-muted-foreground mb-1">الساكن</p>
              <p className="font-medium">{request.residentName ?? '—'}</p>
            </div>
            <div className="bg-muted/40 rounded-xl p-3">
              <p className="text-xs text-muted-foreground mb-1">الوحدة</p>
              <p className="font-medium">{request.unitNumber ?? '—'}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">الحالة</label>
              <select value={status} onChange={e => setStatus(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
                <option value="معلّقة">معلّقة</option>
                <option value="قيد التنفيذ">قيد التنفيذ</option>
                <option value="مكتملة">مكتملة</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">الأولوية</label>
              <select value={priority} onChange={e => setPriority(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
                <option value="عادي">عادي</option>
                <option value="عاجل">عاجل</option>
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">الفني المكلف</label>
            <select value={technicianId} onChange={e => setTechnicianId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
              <option value="">— لم يُعيَّن —</option>
              {technicians.map(t => (
                <option key={t.id} value={t.id}>{t.name} ({t.specialty})</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex gap-3 p-5 border-t border-border">
          <button
            onClick={() => onUpdate(request.id, { status, priority, technicianId: technicianId || null })}
            disabled={isUpdating}
            className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {isUpdating && <span className="w-4 h-4 border-2 border-primary-foreground/40 border-t-primary-foreground rounded-full animate-spin" />}
            حفظ التغييرات
          </button>
          <button onClick={onClose} className="px-5 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors">
            إلغاء
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── properties view ───────────────────────────────────────────────────────────

function PropertiesView() {
  const qc = useQueryClient();
  const [modal, setModal] = useState<null | { mode: 'create' } | { mode: 'edit'; property: Property }>(null);
  const [deleting, setDeleting] = useState<Property | null>(null);

  const { data: properties = [], isLoading } = useGetProperties();

  const { mutate: createProp, isPending: creating } = useCreateProperty({
    mutation: {
      onSuccess() {
        qc.invalidateQueries({ queryKey: getGetPropertiesQueryKey() });
        qc.invalidateQueries({ queryKey: getGetDashboardStatsQueryKey() });
        setModal(null);
      },
    },
  });

  const { mutate: updateProp, isPending: updating } = useUpdateProperty({
    mutation: {
      onSuccess() {
        qc.invalidateQueries({ queryKey: getGetPropertiesQueryKey() });
        setModal(null);
      },
    },
  });

  const { mutate: deleteProp, isPending: delPending } = useDeleteProperty({
    mutation: {
      onSuccess() {
        qc.invalidateQueries({ queryKey: getGetPropertiesQueryKey() });
        qc.invalidateQueries({ queryKey: getGetDashboardStatsQueryKey() });
        setDeleting(null);
      },
    },
  });

  function handleSave(name: string, address: string) {
    if (modal?.mode === 'edit') {
      updateProp({ id: modal.property.id, data: { name, address } });
    } else {
      createProp({ data: { name, address } });
    }
  }

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">العقارات</h1>
          <p className="text-muted-foreground text-sm mt-1">إدارة العقارات المملوكة</p>
        </div>
        <button
          onClick={() => setModal({ mode: 'create' })}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          إضافة عقار
        </button>
      </div>

      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        {isLoading ? (
          <div className="divide-y divide-border">
            {[1, 2, 3].map(i => <div key={i} className="p-4 animate-pulse h-16" />)}
          </div>
        ) : properties.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Building2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">لا توجد عقارات. أضف عقارك الأول.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {/* Header */}
            <div className="grid grid-cols-12 gap-3 px-4 py-2.5 bg-muted/40 text-xs font-medium text-muted-foreground">
              <span className="col-span-4">اسم العقار</span>
              <span className="col-span-5">العنوان</span>
              <span className="col-span-1 text-center">وحدات</span>
              <span className="col-span-2" />
            </div>
            {properties.map(prop => (
              <div key={prop.id} className="grid grid-cols-12 gap-3 px-4 py-3 items-center hover:bg-muted/20 transition-colors">
                <div className="col-span-4 flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                    <Building2 className="w-4 h-4" />
                  </div>
                  <span className="text-sm font-medium truncate">{prop.name}</span>
                </div>
                <span className="col-span-5 text-sm text-muted-foreground truncate">{prop.address}</span>
                <span className="col-span-1 text-center text-sm font-semibold text-primary">{prop.unitCount}</span>
                <div className="col-span-2 flex items-center justify-end gap-1">
                  <button
                    onClick={() => setModal({ mode: 'edit', property: prop })}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    title="تعديل"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setDeleting(prop)}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    title="حذف"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {modal && (
        <PropertyModal
          initial={modal.mode === 'edit' ? modal.property : undefined}
          onSave={handleSave}
          onClose={() => setModal(null)}
          isPending={creating || updating}
        />
      )}

      {deleting && (
        <ConfirmDialog
          message={`هل أنت متأكد من حذف عقار "${deleting.name}"؟ سيتم حذف جميع الوحدات المرتبطة به.`}
          onConfirm={() => deleteProp({ id: deleting.id })}
          onCancel={() => setDeleting(null)}
          isPending={delPending}
        />
      )}
    </div>
  );
}

// ─── units view ────────────────────────────────────────────────────────────────

function UnitsView() {
  const qc = useQueryClient();
  const { data: properties = [], isLoading: propsLoading } = useGetProperties();
  const [selectedPropId, setSelectedPropId] = useState<string>('');
  const [modal, setModal] = useState<null | { mode: 'create' } | { mode: 'edit'; unit: Unit }>(null);
  const [deleting, setDeleting] = useState<Unit | null>(null);

  // Pick first property by default once loaded
  const activePropId = selectedPropId || properties[0]?.id || '';

  const { data: units = [], isLoading: unitsLoading } = useGetUnits(activePropId, {
    query: { enabled: !!activePropId, queryKey: getGetUnitsQueryKey(activePropId) },
  });

  // Fetch residents for the unit assignment dropdown (direct fetch — not in OpenAPI spec)
  const { data: residents = [] } = useQuery<ResidentUser[]>({
    queryKey: ['/api/residents'],
    queryFn: () =>
      fetch('/api/residents', { credentials: 'include' }).then(r => {
        if (!r.ok) throw new Error('Failed to fetch residents');
        return r.json() as Promise<ResidentUser[]>;
      }),
    enabled: !!modal,
  });

  const { mutate: createUnit, isPending: creating } = useCreateUnit({
    mutation: {
      onSuccess() {
        qc.invalidateQueries({ queryKey: getGetUnitsQueryKey(activePropId) });
        qc.invalidateQueries({ queryKey: getGetDashboardStatsQueryKey() });
        setModal(null);
      },
    },
  });

  const { mutate: updateUnit, isPending: updating } = useUpdateUnit({
    mutation: {
      onSuccess() {
        qc.invalidateQueries({ queryKey: getGetUnitsQueryKey(activePropId) });
        // also refresh residents so assignment states update
        qc.invalidateQueries({ queryKey: ['/api/residents'] });
        setModal(null);
      },
    },
  });

  const { mutate: deleteUnit, isPending: delPending } = useDeleteUnit({
    mutation: {
      onSuccess() {
        qc.invalidateQueries({ queryKey: getGetUnitsQueryKey(activePropId) });
        qc.invalidateQueries({ queryKey: getGetDashboardStatsQueryKey() });
        setDeleting(null);
      },
    },
  });

  function handleSave(number: string, floor: number, residentId: string | null) {
    if (modal?.mode === 'edit') {
      updateUnit({ id: modal.unit.id, data: { number, floor, residentId } });
    } else {
      createUnit({ propertyId: activePropId, data: { number, floor, residentId } });
    }
  }

  const activeProp = properties.find(p => p.id === activePropId);

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">الوحدات السكنية</h1>
          <p className="text-muted-foreground text-sm mt-1">إدارة الوحدات وربطها بالسكان</p>
        </div>
        {activePropId && (
          <button
            onClick={() => setModal({ mode: 'create' })}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            إضافة وحدة
          </button>
        )}
      </div>

      {/* Property picker */}
      {propsLoading ? (
        <div className="flex gap-2">
          {[1, 2].map(i => <div key={i} className="h-9 w-32 bg-muted animate-pulse rounded-xl" />)}
        </div>
      ) : properties.length === 0 ? (
        <p className="text-sm text-muted-foreground">لا توجد عقارات. أضف عقاراً أولاً من قسم العقارات.</p>
      ) : (
        <div className="flex gap-2 flex-wrap">
          {properties.map(prop => (
            <button
              key={prop.id}
              onClick={() => setSelectedPropId(prop.id)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors border ${
                (activePropId === prop.id)
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-card text-muted-foreground border-border hover:border-primary/40 hover:text-foreground'
              }`}
            >
              {prop.name}
              <span className="mr-2 text-xs opacity-70">({prop.unitCount})</span>
            </button>
          ))}
        </div>
      )}

      {/* Units table */}
      {activePropId && (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          {unitsLoading ? (
            <div className="divide-y divide-border">
              {[1, 2, 3].map(i => <div key={i} className="p-4 animate-pulse h-14" />)}
            </div>
          ) : units.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Home className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">لا توجد وحدات في {activeProp?.name ?? 'هذا العقار'}. أضف الأولى.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              <div className="grid grid-cols-12 gap-3 px-4 py-2.5 bg-muted/40 text-xs font-medium text-muted-foreground">
                <span className="col-span-3">رقم الوحدة</span>
                <span className="col-span-2">الطابق</span>
                <span className="col-span-5">الساكن</span>
                <span className="col-span-2" />
              </div>
              {units.map(unit => (
                <div key={unit.id} className="grid grid-cols-12 gap-3 px-4 py-3 items-center hover:bg-muted/20 transition-colors">
                  <div className="col-span-3 flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                      <Home className="w-3.5 h-3.5 text-muted-foreground" />
                    </div>
                    <span className="text-sm font-medium">{unit.number}</span>
                  </div>
                  <span className="col-span-2 text-sm text-muted-foreground">الطابق {unit.floor}</span>
                  <div className="col-span-5">
                    {unit.residentName ? (
                      <span className="text-sm font-medium">{unit.residentName}</span>
                    ) : (
                      <span className="text-sm text-muted-foreground italic">شاغرة</span>
                    )}
                  </div>
                  <div className="col-span-2 flex items-center justify-end gap-1">
                    <button
                      onClick={() => setModal({ mode: 'edit', unit })}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      title="تعديل"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setDeleting(unit)}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      title="حذف"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {modal && (
        <UnitModal
          initial={modal.mode === 'edit' ? modal.unit : undefined}
          residents={residents}
          onSave={handleSave}
          onClose={() => setModal(null)}
          isPending={creating || updating}
        />
      )}

      {deleting && (
        <ConfirmDialog
          message={`هل أنت متأكد من حذف الوحدة "${deleting.number}"؟`}
          onConfirm={() => deleteUnit({ id: deleting.id })}
          onCancel={() => setDeleting(null)}
          isPending={delPending}
        />
      )}
    </div>
  );
}

// ─── requests view ─────────────────────────────────────────────────────────────

function RequestsView({
  requests, technicians, reqLoading, onSelect, refetchReq,
}: {
  requests: MaintenanceRequest[];
  technicians: TechnicianProfile[];
  reqLoading: boolean;
  onSelect: (r: MaintenanceRequest) => void;
  refetchReq: () => void;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const filtered = requests.filter(r =>
    r.title.includes(searchQuery) ||
    (r.residentName ?? '').includes(searchQuery) ||
    (r.unitNumber ?? '').includes(searchQuery) ||
    r.status.includes(searchQuery)
  );

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">البلاغات</h1>
          <p className="text-muted-foreground text-sm mt-1">إدارة جميع بلاغات الصيانة</p>
        </div>
        <button onClick={refetchReq} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <RefreshCcw className="w-4 h-4" />
          تحديث
        </button>
      </div>
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="ابحث بالعنوان، الساكن، أو الوحدة..."
          className="w-full pr-10 pl-4 py-2.5 rounded-xl border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        {reqLoading ? (
          <div className="divide-y divide-border">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="p-4 animate-pulse flex gap-4">
                <div className="h-4 bg-muted rounded w-1/3" />
                <div className="h-4 bg-muted rounded w-1/4" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            <Wrench className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">لا توجد بلاغات</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map(req => (
              <div
                key={req.id}
                className="p-4 hover:bg-muted/30 transition-colors cursor-pointer"
                onClick={() => onSelect(req)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <PriorityBadge p={req.priority} />
                      <StatusBadge s={req.status} />
                    </div>
                    <p className="text-sm font-semibold truncate">{req.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {req.residentName} · {req.unitNumber} · {req.category}
                    </p>
                  </div>
                  <ChevronLeft className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-1" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── main manager content ──────────────────────────────────────────────────────

function ManagerContent() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [activeNav, setActiveNav] = useState<NavSection>('dashboard');
  const [selectedRequest, setSelectedRequest] = useState<MaintenanceRequest | null>(null);
  const qc = useQueryClient();

  const { data: stats, isLoading: statsLoading } = useGetDashboardStats();
  const { data: requests = [], isLoading: reqLoading, refetch: refetchReq } = useGetRequests();
  const { data: technicians = [], isLoading: techLoading } = useGetTechnicians();

  const { mutate: updateRequest, isPending: isUpdating } = useUpdateRequest({
    mutation: {
      onSuccess() {
        qc.invalidateQueries({ queryKey: getGetRequestsQueryKey() });
        qc.invalidateQueries({ queryKey: getGetDashboardStatsQueryKey() });
        setSelectedRequest(null);
      },
    },
  });

  const { mutate: doLogout } = useLogout({
    mutation: {
      onSuccess() {
        logout();
        setLocation('/login');
      },
    },
  });

  const navItems: { id: NavSection; label: string; icon: React.ElementType }[] = [
    { id: 'dashboard',   label: 'لوحة التحكم', icon: LayoutDashboard },
    { id: 'properties',  label: 'العقارات',     icon: Building2 },
    { id: 'units',       label: 'الوحدات',      icon: Home },
    { id: 'requests',    label: 'البلاغات',     icon: Wrench },
    { id: 'technicians', label: 'الفنيون',      icon: Users },
  ];

  return (
    <div className="min-h-screen bg-muted/30 flex font-sans" dir="rtl">

      {/* Sidebar */}
      <aside className="w-64 bg-card border-l border-border flex flex-col fixed inset-y-0 right-0 z-10">
        <div className="p-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary text-primary-foreground font-bold text-xl flex items-center justify-center shadow-sm">م</div>
            <div>
              <p className="font-bold text-sm text-foreground">مِرفق</p>
              <p className="text-xs text-muted-foreground">إدارة العقارات</p>
            </div>
          </div>
        </div>

        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-primary/10 text-primary font-bold text-sm flex items-center justify-center">
              {user?.name?.[0]}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{user?.name}</p>
              <p className="text-xs text-muted-foreground">مدير العقار</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveNav(id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                activeNav === id
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </nav>

        <div className="p-3 border-t border-border space-y-1">
          <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-muted-foreground hover:bg-muted transition-colors">
            <Settings className="w-4 h-4" />
            الإعدادات
          </button>
          <button
            onClick={() => doLogout()}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-destructive hover:bg-destructive/10 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            تسجيل الخروج
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 mr-64 p-6 min-h-screen">

        {/* ── Dashboard ── */}
        {activeNav === 'dashboard' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div>
              <h1 className="text-2xl font-bold text-foreground">لوحة التحكم</h1>
              <p className="text-muted-foreground text-sm mt-1">نظرة عامة على العقارات والبلاغات</p>
            </div>

            {/* KPI cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {statsLoading
                ? Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="bg-card border border-border rounded-2xl p-4 animate-pulse h-24" />
                  ))
                : (
                  <>
                    <div className="bg-card border border-border rounded-2xl p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center"><Wrench className="w-4 h-4" /></div>
                        <span className="text-xs text-muted-foreground">إجمالي البلاغات</span>
                      </div>
                      <p className="text-3xl font-bold">{stats?.totalRequests ?? 0}</p>
                    </div>
                    <div className="bg-card border border-border rounded-2xl p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center"><Clock className="w-4 h-4" /></div>
                        <span className="text-xs text-muted-foreground">معلّقة</span>
                      </div>
                      <p className="text-3xl font-bold text-amber-600">{stats?.pending ?? 0}</p>
                    </div>
                    <div className="bg-card border border-border rounded-2xl p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center"><RefreshCcw className="w-4 h-4" /></div>
                        <span className="text-xs text-muted-foreground">قيد التنفيذ</span>
                      </div>
                      <p className="text-3xl font-bold text-blue-600">{stats?.inProgress ?? 0}</p>
                    </div>
                    <div className="bg-card border border-border rounded-2xl p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center"><CheckCircle2 className="w-4 h-4" /></div>
                        <span className="text-xs text-muted-foreground">مكتملة</span>
                      </div>
                      <p className="text-3xl font-bold text-emerald-600">{stats?.completed ?? 0}</p>
                    </div>
                  </>
                )
              }
            </div>

            {/* Secondary stats */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3">
                <Building2 className="w-5 h-5 text-primary" />
                <div>
                  <p className="text-2xl font-bold">{stats?.totalProperties ?? 0}</p>
                  <p className="text-xs text-muted-foreground">عقار</p>
                </div>
              </div>
              <div className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3">
                <Home className="w-5 h-5 text-primary" />
                <div>
                  <p className="text-2xl font-bold">{stats?.totalUnits ?? 0}</p>
                  <p className="text-xs text-muted-foreground">وحدة سكنية</p>
                </div>
              </div>
              <div className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3">
                <Users className="w-5 h-5 text-primary" />
                <div>
                  <p className="text-2xl font-bold">{stats?.totalTechnicians ?? 0}</p>
                  <p className="text-xs text-muted-foreground">فني</p>
                </div>
              </div>
            </div>

            {/* Recent requests */}
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between p-4 border-b border-border">
                <h2 className="font-semibold">أحدث البلاغات</h2>
                <button onClick={() => setActiveNav('requests')} className="text-xs text-primary hover:underline flex items-center gap-1">
                  عرض الكل <ChevronLeft className="w-3 h-3" />
                </button>
              </div>
              {reqLoading ? (
                <div className="p-4 space-y-2">
                  {[1, 2, 3].map(i => <div key={i} className="h-12 bg-muted animate-pulse rounded-xl" />)}
                </div>
              ) : requests.slice(0, 5).map(req => (
                <div
                  key={req.id}
                  className="p-4 hover:bg-muted/30 transition-colors cursor-pointer border-b border-border last:border-0"
                  onClick={() => setSelectedRequest(req)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <PriorityBadge p={req.priority} />
                        <StatusBadge s={req.status} />
                      </div>
                      <p className="text-sm font-semibold truncate">{req.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {req.residentName} · {req.unitNumber} · {req.category}
                      </p>
                    </div>
                    <ChevronLeft className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-1" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Properties ── */}
        {activeNav === 'properties' && <PropertiesView />}

        {/* ── Units ── */}
        {activeNav === 'units' && <UnitsView />}

        {/* ── Requests ── */}
        {activeNav === 'requests' && (
          <RequestsView
            requests={requests}
            technicians={technicians}
            reqLoading={reqLoading}
            onSelect={setSelectedRequest}
            refetchReq={refetchReq}
          />
        )}

        {/* ── Technicians ── */}
        {activeNav === 'technicians' && (
          <div className="space-y-5 animate-in fade-in duration-300">
            <div>
              <h1 className="text-2xl font-bold">الفنيون</h1>
              <p className="text-muted-foreground text-sm mt-1">قائمة فنيي الصيانة وأعمالهم الحالية</p>
            </div>
            {techLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[1, 2, 3].map(i => <div key={i} className="bg-card border border-border rounded-2xl p-5 animate-pulse h-28" />)}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {technicians.map(tech => (
                  <div key={tech.id} className="bg-card border border-border rounded-2xl p-5 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary font-bold text-lg flex items-center justify-center flex-shrink-0">
                      {tech.name[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold">{tech.name}</p>
                      <p className="text-sm text-muted-foreground">{tech.specialty}</p>
                      <p className="text-xs text-muted-foreground" dir="ltr">{tech.phone}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-primary">{tech.activeJobsCount}</p>
                      <p className="text-xs text-muted-foreground">مهمة نشطة</p>
                    </div>
                  </div>
                ))}
                {technicians.length === 0 && (
                  <div className="col-span-2 text-center py-12 text-muted-foreground">
                    <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p>لا يوجد فنيون مسجلون</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Request detail modal (accessible from any view) */}
      {selectedRequest && (
        <RequestDetailModal
          request={selectedRequest}
          technicians={technicians}
          isUpdating={isUpdating}
          onClose={() => setSelectedRequest(null)}
          onUpdate={(id, data) => updateRequest({ id, data })}
        />
      )}
    </div>
  );
}

export default function ManagerDashboard() {
  return (
    <ProtectedRoute allowedRoles={['manager']}>
      <ManagerContent />
    </ProtectedRoute>
  );
}
