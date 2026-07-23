import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  LayoutDashboard, Wrench, Users, Settings, LogOut,
  Search, ChevronLeft, Clock, CheckCircle2, RefreshCcw,
  Building2, Home, Plus, Pencil, Trash2, X, AlertTriangle,
  Eye, EyeOff, Copy, Check, Shield, ClipboardList,
  Printer, UserCheck, UserX, Palette, Phone,
  QrCode, Download, CalendarCheck2, CircleDollarSign,
  Star,
} from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
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

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  phone?: string | null;
  unitNumber?: string | null;
  specialty?: string | null;
  createdAt: string;
}

interface AuditEntry {
  id: string;
  action: string;
  actorName: string;
  entityType: string;
  entityLabel?: string | null;
  details?: string | null;
  createdAt: string;
}

interface OrgSettings {
  id: string;
  name: string;
  crNumber?: string | null;
  phone?: string | null;
  city: string;
  brandColor: string;
}
import { useAuth } from '@/context/AuthContext';
import { ProtectedRoute } from '@/components/ProtectedRoute';

// ─── types ────────────────────────────────────────────────────────────────────

type NavSection = 'dashboard' | 'properties' | 'units' | 'requests' | 'preventive' | 'technicians' | 'users' | 'audit' | 'settings';

interface ResidentUser {
  id: string;
  name: string;
  email: string;
  unitId: string | null;
  unitNumber: string | null;
}

interface PreventivePlan {
  id: string;
  propertyId: string;
  propertyName?: string | null;
  unitId?: string | null;
  unitNumber?: string | null;
  assignedTechnicianId?: string | null;
  assignedTechnicianName?: string | null;
  technicianName?: string | null;
  title: string;
  category: string;
  frequencyDays: number;
  nextDueAt: string;
  notes?: string | null;
  isActive: boolean;
  lastCompletedAt?: string | null;
}

function UnitQrModal({
  unit,
  propertyName,
  onClose,
  onTokenRotated,
}: {
  unit: Unit;
  propertyName: string;
  onClose: () => void;
  onTokenRotated: (unit: Unit) => void;
}) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [isRotating, setIsRotating] = useState(false);
  const [confirmRotation, setConfirmRotation] = useState(false);
  const [rotationError, setRotationError] = useState('');
  const publicToken = unit.publicToken;
  const basePath = import.meta.env.BASE_URL.endsWith('/')
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`;
  const reportUrl = publicToken
    ? `${window.location.origin}${basePath}report/${encodeURIComponent(publicToken)}`
    : null;

  function downloadQr() {
    const canvas = canvasRef.current?.querySelector('canvas');
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `mirfaq-${propertyName}-${unit.number}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

  async function rotateToken() {
    if (isRotating) return;
    setIsRotating(true);
    setRotationError('');
    try {
      const response = await fetch(
        `/api/units/${encodeURIComponent(unit.id)}/public-token/rotate`,
        {
          method: 'POST',
          credentials: 'include',
        },
      );
      const payload = await response.json().catch(() => null) as
        | (Partial<Unit> & { publicToken?: string; error?: string })
        | null;
      if (!response.ok || !payload?.publicToken) {
        throw new Error(payload?.error || 'تعذّر تجديد رمز QR');
      }
      onTokenRotated({ ...unit, ...payload } as Unit);
      setConfirmRotation(false);
    } catch (error) {
      setRotationError(error instanceof Error ? error.message : 'تعذّر تجديد رمز QR');
    } finally {
      setIsRotating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/75 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-3xl border bg-card p-6 text-center shadow-2xl">
        <div className="mb-5 flex items-center justify-between text-right">
          <div>
            <h2 className="font-bold">رمز بلاغ الوحدة</h2>
            <p className="text-sm text-muted-foreground">{propertyName} — {unit.number}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 hover:bg-muted" aria-label="إغلاق"><X className="h-5 w-5" /></button>
        </div>
        {reportUrl ? (
          <>
            <div ref={canvasRef} className="mx-auto inline-flex rounded-2xl border bg-white p-5">
              <QRCodeCanvas value={reportUrl} size={220} level="H" marginSize={1} />
            </div>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              نزّل الرمز وضعه داخل الوحدة. يفتح صفحة بلاغ عامة وآمنة بدون تسجيل دخول.
            </p>
            <button onClick={downloadQr} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-bold text-primary-foreground">
              <Download className="h-4 w-4" /> تنزيل PNG
            </button>
            {confirmRotation ? (
              <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-right">
                <p className="text-xs leading-5 text-amber-900">
                  الرمز الحالي سيتوقف فورًا. نزّل الرمز الجديد واستبدل الملصق القديم.
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={rotateToken}
                    disabled={isRotating}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-amber-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
                  >
                    <RefreshCcw className={`h-3.5 w-3.5 ${isRotating ? 'animate-spin' : ''}`} />
                    {isRotating ? 'جارٍ التجديد…' : 'نعم، جدّد الرمز'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmRotation(false)}
                    disabled={isRotating}
                    className="rounded-xl border border-amber-300 px-3 py-2 text-xs font-medium text-amber-900 disabled:opacity-60"
                  >
                    إلغاء
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => { setConfirmRotation(true); setRotationError(''); }}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <RefreshCcw className="h-4 w-4" />
                تجديد الرمز
              </button>
            )}
            {rotationError && <p className="mt-2 text-xs text-destructive">{rotationError}</p>}
          </>
        ) : (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-900">
            رمز البلاغ العام غير متاح لهذه الوحدة بعد. حدّث الصفحة بعد ترقية قاعدة البيانات.
          </div>
        )}
      </div>
    </div>
  );
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
  const qc = useQueryClient();
  const requestWithCosts = request as MaintenanceRequest & {
    laborCost?: number | null;
    partsCost?: number | null;
  };
  const [status, setStatus] = useState(request.status);
  const [priority, setPriority] = useState(request.priority);
  const [technicianId, setTechnicianId] = useState(request.technicianId ?? '');
  const [laborCost, setLaborCost] = useState(String(requestWithCosts.laborCost ?? 0));
  const [partsCost, setPartsCost] = useState(String(requestWithCosts.partsCost ?? 0));
  const [isSavingCosts, setIsSavingCosts] = useState(false);
  const [costError, setCostError] = useState('');
  const [costSaved, setCostSaved] = useState(false);
  const laborValue = Number(laborCost || 0);
  const partsValue = Number(partsCost || 0);
  const totalCost = (Number.isFinite(laborValue) ? laborValue : 0) + (Number.isFinite(partsValue) ? partsValue : 0);

  async function saveCosts() {
    if (!Number.isFinite(laborValue) || !Number.isFinite(partsValue) || laborValue < 0 || partsValue < 0) {
      setCostError('أدخل تكاليف صحيحة وغير سالبة');
      return;
    }

    setIsSavingCosts(true);
    setCostError('');
    setCostSaved(false);
    try {
      const response = await fetch(`/api/requests/${encodeURIComponent(request.id)}/costs`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ laborCost: laborValue, partsCost: partsValue }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(payload?.error || 'تعذّر حفظ التكاليف');
      }
      await qc.invalidateQueries({ queryKey: getGetRequestsQueryKey() });
      setCostSaved(true);
    } catch (error) {
      setCostError(error instanceof Error ? error.message : 'تعذّر حفظ التكاليف');
    } finally {
      setIsSavingCosts(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-background/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="max-h-[calc(100vh-2rem)] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-card shadow-xl" onClick={e => e.stopPropagation()}>
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
          <div className="rounded-2xl border border-border bg-muted/20 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <CircleDollarSign className="h-4 w-4 text-primary" />
              <h4 className="text-sm font-semibold">تكلفة الصيانة</h4>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="space-y-1.5 text-sm">
                <span className="font-medium">أجور العمالة (ر.س)</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={laborCost}
                  onChange={event => { setLaborCost(event.target.value); setCostSaved(false); }}
                  className="w-full rounded-xl border border-input bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </label>
              <label className="space-y-1.5 text-sm">
                <span className="font-medium">قطع الغيار (ر.س)</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={partsCost}
                  onChange={event => { setPartsCost(event.target.value); setCostSaved(false); }}
                  className="w-full rounded-xl border border-input bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </label>
            </div>
            <div className="flex flex-col gap-3 rounded-xl bg-background p-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm">
                الإجمالي: <strong className="text-base">{totalCost.toLocaleString('ar-SA', { maximumFractionDigits: 2 })} ر.س</strong>
              </p>
              <button
                type="button"
                onClick={saveCosts}
                disabled={isSavingCosts}
                className="rounded-xl border border-primary px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/10 disabled:opacity-60"
              >
                {isSavingCosts ? 'جارٍ الحفظ…' : 'حفظ التكاليف'}
              </button>
            </div>
            {costError && <p className="text-xs text-destructive">{costError}</p>}
            {costSaved && <p className="text-xs text-emerald-700">تم حفظ التكاليف</p>}
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

// ─── settings view ─────────────────────────────────────────────────────────────

function SettingsView() {
  const [settings, setSettings] = useState<OrgSettings | null>(null);
  const [name, setName] = useState('');
  const [crNumber, setCrNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [brandColor, setBrandColor] = useState('#0891b2');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/settings', { credentials: 'include' })
      .then(r => r.json())
      .then((d: OrgSettings) => {
        setSettings(d);
        setName(d.name ?? '');
        setCrNumber(d.crNumber ?? '');
        setPhone(d.phone ?? '');
        setCity(d.city ?? '');
        setBrandColor(d.brandColor ?? '#0891b2');
        setIsLoading(false);
      })
      .catch(() => { setError('تعذّر تحميل الإعدادات'); setIsLoading(false); });
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !city.trim()) return;
    setIsSaving(true);
    setError('');
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: name.trim(), crNumber: crNumber.trim() || null, phone: phone.trim() || null, city: city.trim(), brandColor }),
      });
      if (!res.ok) throw new Error();
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError('فشل الحفظ — حاول مجدداً');
    }
    setIsSaving(false);
  }

  if (isLoading) return (
    <div className="space-y-4 animate-in fade-in">
      {[1,2,3,4].map(i => <div key={i} className="h-14 bg-muted animate-pulse rounded-2xl" />)}
    </div>
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-300 max-w-lg">
      <div>
        <h1 className="text-2xl font-bold">إعدادات الشركة</h1>
        <p className="text-muted-foreground text-sm mt-1">معلومات المنشأة وهوية العلامة التجارية</p>
      </div>

      <form onSubmit={handleSave} className="bg-card border border-border rounded-2xl p-5 space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">اسم الشركة <span className="text-destructive">*</span></label>
          <input
            value={name} onChange={e => setName(e.target.value)} required
            className="w-full px-3 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">المدينة <span className="text-destructive">*</span></label>
            <input
              value={city} onChange={e => setCity(e.target.value)} required
              placeholder="الرياض"
              className="w-full px-3 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium flex items-center gap-1"><Phone className="w-3.5 h-3.5" />الهاتف</label>
            <input
              value={phone} onChange={e => setPhone(e.target.value)} dir="ltr"
              placeholder="+966 5x xxx xxxx"
              className="w-full px-3 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">رقم السجل التجاري</label>
          <input
            value={crNumber} onChange={e => setCrNumber(e.target.value)} dir="ltr"
            placeholder="10xxxxxxxxx"
            className="w-full px-3 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium flex items-center gap-1.5"><Palette className="w-3.5 h-3.5" />لون العلامة التجارية</label>
          <div className="flex items-center gap-3">
            <input
              type="color" value={brandColor} onChange={e => setBrandColor(e.target.value)}
              className="w-12 h-10 rounded-xl border border-input cursor-pointer p-0.5 bg-background"
            />
            <input
              value={brandColor} onChange={e => setBrandColor(e.target.value)} dir="ltr"
              placeholder="#0891b2"
              className="flex-1 px-3 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 font-mono"
            />
            <div className="w-10 h-10 rounded-xl border border-border flex-shrink-0" style={{ backgroundColor: brandColor }} />
          </div>
          <p className="text-xs text-muted-foreground">يُطبَّق على لوحة التحكم عند إعادة الدخول</p>
        </div>

        {error && <p className="text-sm text-destructive bg-destructive/10 rounded-xl px-3 py-2">{error}</p>}

        <button
          type="submit" disabled={isSaving || !name.trim() || !city.trim()}
          className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {isSaving && <span className="w-4 h-4 border-2 border-primary-foreground/40 border-t-primary-foreground rounded-full animate-spin" />}
          {saved ? <><Check className="w-4 h-4" />تم الحفظ</> : 'حفظ الإعدادات'}
        </button>
      </form>
    </div>
  );
}

// ─── users view ────────────────────────────────────────────────────────────────

function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function CreateUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('resident');
  const [phone, setPhone] = useState('');
  const [specialty, setSpecialty] = useState('كهرباء');
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState('');
  const [createdPwd, setCreatedPwd] = useState('');
  const [copied, setCopied] = useState(false);

  const tempPwd = useRef(generateTempPassword());

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsPending(true); setError('');
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: name.trim(), email: email.trim(), role,
          password: tempPwd.current,
          phone: phone.trim() || undefined,
          specialty: role === 'technician' ? specialty : undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'فشل الإنشاء');
      setCreatedPwd(tempPwd.current);
      onCreated();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
      setIsPending(false);
    }
  }

  function copyPwd() {
    navigator.clipboard.writeText(createdPwd);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (createdPwd) return (
    <div className="fixed inset-0 bg-background/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl w-full max-w-sm shadow-xl p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-6 h-6" />
        </div>
        <div className="text-center">
          <h2 className="font-bold text-lg">تم إنشاء الحساب</h2>
          <p className="text-sm text-muted-foreground mt-1">سلّم كلمة المرور المؤقتة هذه للمستخدم مباشرةً</p>
        </div>
        <div className="bg-muted rounded-xl p-3 flex items-center gap-3">
          <code className="flex-1 text-sm font-mono font-bold tracking-widest" dir="ltr">{createdPwd}</code>
          <button onClick={copyPwd} className="text-primary hover:text-primary/80 transition-colors">
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-center">
          ⚠️ لن تظهر هذه الكلمة مجدداً — احفظها الآن
        </p>
        <button onClick={onClose} className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors">
          تم، أغلق
        </button>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-background/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="font-bold">إضافة مستخدم جديد</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">الاسم الكامل</label>
            <input value={name} onChange={e => setName(e.target.value)} required
              className="w-full px-3 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">البريد الإلكتروني</label>
            <input value={email} onChange={e => setEmail(e.target.value)} type="email" required dir="ltr"
              className="w-full px-3 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">الدور</label>
              <select value={role} onChange={e => setRole(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
                <option value="resident">ساكن</option>
                <option value="technician">فني</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">الهاتف</label>
              <input value={phone} onChange={e => setPhone(e.target.value)} dir="ltr"
                className="w-full px-3 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
          </div>
          {role === 'technician' && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">التخصص</label>
              <select value={specialty} onChange={e => setSpecialty(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
                {['كهرباء','سباكة','تكييف','نجارة','دهانات','صيانة عامة'].map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
          )}
          {error && <p className="text-sm text-destructive bg-destructive/10 rounded-xl px-3 py-2">{error}</p>}
        </form>
        <div className="flex gap-3 p-5 border-t border-border">
          <button
            type="button" onClick={handleSubmit as unknown as React.MouseEventHandler}
            disabled={isPending || !name.trim() || !email.trim()}
            className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {isPending && <span className="w-4 h-4 border-2 border-primary-foreground/40 border-t-primary-foreground rounded-full animate-spin" />}
            إنشاء الحساب
          </button>
          <button onClick={onClose} className="px-5 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors">إلغاء</button>
        </div>
      </div>
    </div>
  );
}

function UsersView() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [filterRole, setFilterRole] = useState<string>('all');

  async function loadUsers() {
    const res = await fetch('/api/users', { credentials: 'include' });
    const data = await res.json() as UserRow[];
    setUsers(data);
    setIsLoading(false);
  }

  useEffect(() => { loadUsers(); }, []);

  async function toggleActive(u: UserRow) {
    setTogglingId(u.id);
    await fetch(`/api/users/${u.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ isActive: !u.isActive }),
    });
    await loadUsers();
    setTogglingId(null);
  }

  const ROLE_LABELS: Record<string, string> = { resident: 'ساكن', technician: 'فني', manager: 'مدير' };

  const filtered = filterRole === 'all' ? users : users.filter(u => u.role === filterRole);

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">المستخدمون</h1>
          <p className="text-muted-foreground text-sm mt-1">إدارة حسابات السكان والفنيين</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          مستخدم جديد
        </button>
      </div>

      {/* Role filter */}
      <div className="flex gap-2">
        {[['all','الكل'],['resident','السكان'],['technician','الفنيون'],['manager','المديرون']].map(([v,l]) => (
          <button key={v} onClick={() => setFilterRole(v)}
            className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-colors border ${
              filterRole === v ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground border-border hover:border-primary/40'
            }`}>{l}</button>
        ))}
      </div>

      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        {isLoading ? (
          <div className="divide-y divide-border">
            {[1,2,3,4].map(i => <div key={i} className="p-4 animate-pulse h-16" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">لا يوجد مستخدمون في هذا التصنيف</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            <div className="grid grid-cols-12 gap-3 px-4 py-2.5 bg-muted/40 text-xs font-medium text-muted-foreground">
              <span className="col-span-4">الاسم</span>
              <span className="col-span-3">البريد</span>
              <span className="col-span-2">الدور</span>
              <span className="col-span-2">الوحدة / التخصص</span>
              <span className="col-span-1" />
            </div>
            {filtered.map(u => (
              <div key={u.id} className={`grid grid-cols-12 gap-3 px-4 py-3 items-center hover:bg-muted/20 transition-colors ${!u.isActive ? 'opacity-50' : ''}`}>
                <div className="col-span-4 flex items-center gap-2 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-sm flex items-center justify-center flex-shrink-0">
                    {u.name[0]}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{u.name}</p>
                    {!u.isActive && <span className="text-xs text-destructive">معطّل</span>}
                  </div>
                </div>
                <span className="col-span-3 text-xs text-muted-foreground truncate" dir="ltr">{u.email}</span>
                <span className="col-span-2">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${
                    u.role === 'manager' ? 'bg-purple-100 text-purple-700 border-purple-200' :
                    u.role === 'technician' ? 'bg-blue-100 text-blue-700 border-blue-200' :
                    'bg-emerald-100 text-emerald-700 border-emerald-200'
                  }`}>{ROLE_LABELS[u.role] ?? u.role}</span>
                </span>
                <span className="col-span-2 text-xs text-muted-foreground truncate">
                  {u.unitNumber ?? u.specialty ?? '—'}
                </span>
                <div className="col-span-1 flex justify-end">
                  <button
                    onClick={() => toggleActive(u)}
                    disabled={togglingId === u.id}
                    title={u.isActive ? 'تعطيل الحساب' : 'تفعيل الحساب'}
                    className={`p-1.5 rounded-lg transition-colors disabled:opacity-50 ${
                      u.isActive
                        ? 'text-muted-foreground hover:text-destructive hover:bg-destructive/10'
                        : 'text-muted-foreground hover:text-emerald-600 hover:bg-emerald-50'
                    }`}
                  >
                    {u.isActive ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showCreate && (
        <CreateUserModal
          onClose={() => setShowCreate(false)}
          onCreated={loadUsers}
        />
      )}
    </div>
  );
}

// ─── audit view ────────────────────────────────────────────────────────────────

function AuditView() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch('/api/audit', { credentials: 'include' })
      .then(r => r.json())
      .then((d: AuditEntry[]) => { setEntries(d); setIsLoading(false); })
      .catch(() => setIsLoading(false));
  }, []);

  const ENTITY_LABELS: Record<string, string> = {
    Property: 'عقار', Unit: 'وحدة', MaintenanceRequest: 'بلاغ',
    RequestAttachment: 'مرفق', User: 'مستخدم', Organization: 'منشأة',
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      <div>
        <h1 className="text-2xl font-bold">سجل العمليات</h1>
        <p className="text-muted-foreground text-sm mt-1">آخر 200 عملية في المنصة</p>
      </div>

      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        {isLoading ? (
          <div className="divide-y divide-border">
            {[1,2,3,4,5].map(i => <div key={i} className="p-4 animate-pulse h-14" />)}
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <ClipboardList className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">لا توجد سجلات بعد</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            <div className="grid grid-cols-12 gap-3 px-4 py-2.5 bg-muted/40 text-xs font-medium text-muted-foreground">
              <span className="col-span-3">العملية</span>
              <span className="col-span-2">المنفِّذ</span>
              <span className="col-span-2">النوع</span>
              <span className="col-span-3">الكيان</span>
              <span className="col-span-2">التاريخ</span>
            </div>
            {entries.map(e => (
              <div key={e.id} className="grid grid-cols-12 gap-3 px-4 py-3 items-start hover:bg-muted/20 transition-colors">
                <div className="col-span-3">
                  <span className="text-xs font-medium bg-muted rounded-lg px-2 py-0.5">{e.action}</span>
                </div>
                <span className="col-span-2 text-sm text-foreground">{e.actorName}</span>
                <span className="col-span-2 text-xs text-muted-foreground">{ENTITY_LABELS[e.entityType] ?? e.entityType}</span>
                <span className="col-span-3 text-xs text-muted-foreground truncate">{e.entityLabel ?? '—'}</span>
                <span className="col-span-2 text-xs text-muted-foreground" dir="ltr">
                  {new Date(e.createdAt).toLocaleDateString('ar-SA', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' })}
                </span>
              </div>
            ))}
          </div>
        )}
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
  const [qrUnit, setQrUnit] = useState<Unit | null>(null);

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
        <div className="bg-card border border-border rounded-2xl overflow-x-auto">
          {unitsLoading ? (
            <div className="divide-y divide-border min-w-[640px]">
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
                      onClick={() => setQrUnit(unit)}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                      title="رمز QR للبلاغ"
                    >
                      <QrCode className="w-3.5 h-3.5" />
                    </button>
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

      {qrUnit && (
        <UnitQrModal
          unit={qrUnit}
          propertyName={activeProp?.name ?? 'العقار'}
          onClose={() => setQrUnit(null)}
          onTokenRotated={updatedUnit => {
            setQrUnit(updatedUnit);
            qc.setQueryData<Unit[]>(
              getGetUnitsQueryKey(activePropId),
              current => current?.map(unit => unit.id === updatedUnit.id ? updatedUnit : unit),
            );
          }}
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
  const now = new Date();
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
        <div className="flex items-center gap-2">
          <a
            href={`/print/monthly?year=${now.getFullYear()}&month=${now.getMonth() + 1}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <Printer className="w-4 h-4" />
            تقرير شهري
          </a>
          <button onClick={refetchReq} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors px-3 py-2 rounded-xl border border-border hover:bg-muted">
            <RefreshCcw className="w-4 h-4" />
            تحديث
          </button>
        </div>
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
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <a
                      href={`/print/work-order/${req.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      title="طباعة أمر العمل"
                    >
                      <Printer className="w-3.5 h-3.5" />
                    </a>
                    <ChevronLeft className="w-4 h-4 text-muted-foreground mt-0.5" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── preventive maintenance view ──────────────────────────────────────────────

function dueState(plan: PreventivePlan) {
  if (!plan.isActive) {
    return { label: 'متوقفة', className: 'border-slate-200 bg-slate-100 text-slate-700' };
  }

  const due = new Date(plan.nextDueAt);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  const days = Math.ceil((due.getTime() - today.getTime()) / 86_400_000);

  if (days <= 0) {
    return { label: days < 0 ? `متأخرة ${Math.abs(days)} يوم` : 'مستحقة اليوم', className: 'border-red-200 bg-red-100 text-red-800' };
  }
  if (days <= 7) {
    return { label: `قريبة خلال ${days} يوم`, className: 'border-amber-200 bg-amber-100 text-amber-800' };
  }
  return { label: `لاحقة بعد ${days} يوم`, className: 'border-emerald-200 bg-emerald-100 text-emerald-800' };
}

function PreventiveMaintenanceView({ technicians }: { technicians: TechnicianProfile[] }) {
  const qc = useQueryClient();
  const { data: properties = [], isLoading: propertiesLoading } = useGetProperties();
  const [showForm, setShowForm] = useState(false);
  const [propertyId, setPropertyId] = useState('');
  const [unitId, setUnitId] = useState('');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('تكييف');
  const [frequencyDays, setFrequencyDays] = useState('90');
  const [nextDueAt, setNextDueAt] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() + 7);
    return date.toISOString().slice(0, 10);
  });
  const [assignedTechnicianId, setAssignedTechnicianId] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingAction, setPendingAction] = useState('');
  const [planToDelete, setPlanToDelete] = useState<PreventivePlan | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!propertyId && properties[0]?.id) setPropertyId(properties[0].id);
  }, [properties, propertyId]);

  const plansQuery = useQuery<PreventivePlan[]>({
    queryKey: ['preventive-plans'],
    queryFn: async () => {
      const response = await fetch('/api/preventive-plans', { credentials: 'include' });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error((payload as { error?: string } | null)?.error || 'تعذّر تحميل خطط الصيانة');
      return payload as PreventivePlan[];
    },
  });

  const unitsQuery = useQuery<Unit[]>({
    queryKey: ['preventive-plan-units', propertyId],
    enabled: !!propertyId,
    queryFn: async () => {
      const response = await fetch(`/api/properties/${encodeURIComponent(propertyId)}/units`, { credentials: 'include' });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error((payload as { error?: string } | null)?.error || 'تعذّر تحميل الوحدات');
      return payload as Unit[];
    },
  });

  async function submitPlan(event: React.FormEvent) {
    event.preventDefault();
    const interval = Number(frequencyDays);
    if (!propertyId || !title.trim() || !Number.isInteger(interval) || interval < 1 || !nextDueAt) {
      setError('أكمل الحقول المطلوبة بقيم صحيحة');
      return;
    }

    setIsSubmitting(true);
    setError('');
    try {
      const response = await fetch('/api/preventive-plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          propertyId,
          unitId: unitId || undefined,
          title: title.trim(),
          category,
          frequencyDays: interval,
          nextDueAt: new Date(`${nextDueAt}T12:00:00`).toISOString(),
          assignedTechnicianId: assignedTechnicianId || undefined,
          notes: notes.trim() || undefined,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error((payload as { error?: string } | null)?.error || 'تعذّر إنشاء الخطة');
      await qc.invalidateQueries({ queryKey: ['preventive-plans'] });
      setTitle('');
      setUnitId('');
      setAssignedTechnicianId('');
      setNotes('');
      setShowForm(false);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'تعذّر إنشاء الخطة');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function updatePlan(
    plan: PreventivePlan,
    action: 'complete' | 'toggle' | 'delete',
  ) {
    const actionKey = `${action}:${plan.id}`;
    setPendingAction(actionKey);
    setError('');
    try {
      const path = action === 'complete'
        ? `/api/preventive-plans/${encodeURIComponent(plan.id)}/complete`
        : `/api/preventive-plans/${encodeURIComponent(plan.id)}`;
      const response = await fetch(path, {
        method: action === 'delete' ? 'DELETE' : action === 'complete' ? 'POST' : 'PATCH',
        headers: action === 'toggle' ? { 'Content-Type': 'application/json' } : undefined,
        credentials: 'include',
        body: action === 'toggle' ? JSON.stringify({ isActive: !plan.isActive }) : undefined,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error((payload as { error?: string } | null)?.error || 'تعذّر تنفيذ العملية');
      await qc.invalidateQueries({ queryKey: ['preventive-plans'] });
      if (action === 'delete') setPlanToDelete(null);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'تعذّر تنفيذ العملية');
    } finally {
      setPendingAction('');
    }
  }

  const plans = plansQuery.data ?? [];

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">الصيانة الوقائية</h1>
          <p className="mt-1 text-sm text-muted-foreground">جدولة الأعمال الدورية قبل حدوث الأعطال</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => plansQuery.refetch()}
            disabled={plansQuery.isFetching}
            className="flex items-center justify-center gap-2 rounded-xl border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-60"
          >
            <RefreshCcw className={`h-4 w-4 ${plansQuery.isFetching ? 'animate-spin' : ''}`} />
            تحديث
          </button>
          <button
            type="button"
            onClick={() => { setShowForm(current => !current); setError(''); }}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground sm:flex-none"
          >
            {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showForm ? 'إغلاق النموذج' : 'خطة جديدة'}
          </button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={submitPlan} className="space-y-4 rounded-2xl border border-border bg-card p-4 md:p-5">
          <div className="flex items-center gap-2">
            <CalendarCheck2 className="h-5 w-5 text-primary" />
            <h2 className="font-semibold">إضافة خطة دورية</h2>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">اسم المهمة *</span>
              <input
                value={title}
                onChange={event => setTitle(event.target.value)}
                placeholder="مثال: تنظيف فلاتر المكيفات"
                className="w-full rounded-xl border border-input bg-background px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/30"
                required
              />
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">التصنيف *</span>
              <select
                value={category}
                onChange={event => setCategory(event.target.value)}
                className="w-full rounded-xl border border-input bg-background px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                {['تكييف', 'كهرباء', 'سباكة', 'مصاعد', 'سلامة', 'نظافة', 'أخرى'].map(item => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">العقار *</span>
              <select
                value={propertyId}
                onChange={event => { setPropertyId(event.target.value); setUnitId(''); }}
                disabled={propertiesLoading}
                className="w-full rounded-xl border border-input bg-background px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60"
                required
              >
                <option value="">اختر العقار</option>
                {properties.map(property => <option key={property.id} value={property.id}>{property.name}</option>)}
              </select>
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">الوحدة (اختياري)</span>
              <select
                value={unitId}
                onChange={event => setUnitId(event.target.value)}
                disabled={!propertyId || unitsQuery.isLoading}
                className="w-full rounded-xl border border-input bg-background px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60"
              >
                <option value="">كل العقار</option>
                {(unitsQuery.data ?? []).map(unit => <option key={unit.id} value={unit.id}>وحدة {unit.number}</option>)}
              </select>
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">التكرار كل كم يوم؟ *</span>
              <input
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                value={frequencyDays}
                onChange={event => setFrequencyDays(event.target.value)}
                className="w-full rounded-xl border border-input bg-background px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/30"
                required
              />
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">موعد التنفيذ القادم *</span>
              <input
                type="date"
                value={nextDueAt}
                onChange={event => setNextDueAt(event.target.value)}
                className="w-full rounded-xl border border-input bg-background px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/30"
                required
              />
            </label>
            <label className="space-y-1.5 text-sm md:col-span-2">
              <span className="font-medium">الفني المكلف (اختياري)</span>
              <select
                value={assignedTechnicianId}
                onChange={event => setAssignedTechnicianId(event.target.value)}
                className="w-full rounded-xl border border-input bg-background px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="">بدون تعيين</option>
                {technicians.map(technician => (
                  <option key={technician.id} value={technician.id}>{technician.name} ({technician.specialty})</option>
                ))}
              </select>
            </label>
            <label className="space-y-1.5 text-sm md:col-span-2">
              <span className="font-medium">ملاحظات</span>
              <textarea
                value={notes}
                onChange={event => setNotes(event.target.value)}
                rows={3}
                placeholder="تعليمات التنفيذ أو المواد المطلوبة"
                className="w-full resize-none rounded-xl border border-input bg-background px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </label>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <button
            type="submit"
            disabled={isSubmitting || properties.length === 0}
            className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60 sm:w-auto"
          >
            {isSubmitting ? 'جارٍ الإنشاء…' : 'حفظ الخطة'}
          </button>
        </form>
      )}

      {!showForm && error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>
      )}

      {plansQuery.isLoading ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {[1, 2, 3, 4].map(item => <div key={item} className="h-48 animate-pulse rounded-2xl border border-border bg-card" />)}
        </div>
      ) : plansQuery.isError ? (
        <div className="rounded-2xl border border-destructive/30 bg-card p-8 text-center text-sm text-destructive">
          {plansQuery.error instanceof Error ? plansQuery.error.message : 'تعذّر تحميل خطط الصيانة'}
        </div>
      ) : plans.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card py-14 text-center text-muted-foreground">
          <CalendarCheck2 className="mx-auto mb-3 h-10 w-10 opacity-30" />
          <p className="font-medium">لا توجد خطط صيانة وقائية</p>
          <p className="mt-1 text-sm">أنشئ أول خطة لمتابعة الأعمال الدورية.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {plans.map(plan => {
            const state = dueState(plan);
            const technicianName = plan.assignedTechnicianName ?? plan.technicianName;
            return (
              <article key={plan.id} className={`rounded-2xl border border-border bg-card p-4 md:p-5 ${plan.isActive ? '' : 'opacity-70'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${state.className}`}>{state.label}</span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{plan.category}</span>
                    </div>
                    <h2 className="font-semibold">{plan.title}</h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {plan.propertyName ?? 'العقار'}
                      {plan.unitNumber ? ` · وحدة ${plan.unitNumber}` : ' · كامل العقار'}
                    </p>
                  </div>
                  <CalendarCheck2 className="h-5 w-5 shrink-0 text-primary" />
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-muted/30 p-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">الموعد القادم</p>
                    <p className="mt-0.5 font-medium">{new Date(plan.nextDueAt).toLocaleDateString('ar-SA')}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">التكرار</p>
                    <p className="mt-0.5 font-medium">كل {plan.frequencyDays} يوم</p>
                  </div>
                  {technicianName && (
                    <div className="col-span-2">
                      <p className="text-xs text-muted-foreground">الفني</p>
                      <p className="mt-0.5 font-medium">{technicianName}</p>
                    </div>
                  )}
                </div>
                {plan.notes && <p className="mt-3 text-sm leading-6 text-muted-foreground">{plan.notes}</p>}

                <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
                  {plan.isActive && (
                    <button
                      type="button"
                      onClick={() => updatePlan(plan, 'complete')}
                      disabled={!!pendingAction}
                      className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      {pendingAction === `complete:${plan.id}` ? 'جارٍ الإتمام…' : 'تسجيل الإتمام'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => updatePlan(plan, 'toggle')}
                    disabled={!!pendingAction}
                    className="rounded-xl border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-60"
                  >
                    {pendingAction === `toggle:${plan.id}` ? 'جارٍ…' : plan.isActive ? 'تعطيل' : 'تفعيل'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPlanToDelete(plan)}
                    disabled={!!pendingAction}
                    aria-label={`حذف ${plan.title}`}
                    className="rounded-xl border border-destructive/30 p-2 text-destructive hover:bg-destructive/10 disabled:opacity-60"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {planToDelete && (
        <ConfirmDialog
          message={`هل أنت متأكد من حذف خطة "${planToDelete.title}"؟`}
          onConfirm={() => updatePlan(planToDelete, 'delete')}
          onCancel={() => setPlanToDelete(null)}
          isPending={pendingAction === `delete:${planToDelete.id}`}
        />
      )}
    </div>
  );
}

// ─── main manager content ──────────────────────────────────────────────────────

function ManagerContent() {
  const { user, logout } = useAuth() as { user: import('@/context/AuthContext').ExtAuthUser | null; logout: () => void };
  const [, setLocation] = useLocation();
  const [activeNav, setActiveNav] = useState<NavSection>('dashboard');
  const [selectedRequest, setSelectedRequest] = useState<MaintenanceRequest | null>(null);
  const qc = useQueryClient();

  const { data: stats, isLoading: statsLoading } = useGetDashboardStats();
  const { data: requests = [], isLoading: reqLoading, refetch: refetchReq } = useGetRequests();
  const { data: technicians = [], isLoading: techLoading } = useGetTechnicians();
  const {
    data: dashboardPreventivePlans = [],
    isLoading: dashboardPlansLoading,
    isError: dashboardPlansError,
  } = useQuery<PreventivePlan[]>({
    queryKey: ['preventive-plans', { isActive: true }],
    enabled: activeNav === 'dashboard',
    queryFn: async () => {
      const response = await fetch('/api/preventive-plans?isActive=true', { credentials: 'include' });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error((payload as { error?: string } | null)?.error || 'تعذّر تحميل خطط الصيانة');
      }
      return payload as PreventivePlan[];
    },
  });

  const totalLaborCost = requests.reduce((sum, request) => {
    const value = Number(request.laborCost);
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);
  const totalPartsCost = requests.reduce((sum, request) => {
    const value = Number(request.partsCost);
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);
  const totalMaintenanceCost = requests.reduce((sum, request) => {
    const total = Number(request.totalCost);
    if (Number.isFinite(total)) return sum + total;
    const labor = Number(request.laborCost);
    const parts = Number(request.partsCost);
    return sum
      + (Number.isFinite(labor) ? labor : 0)
      + (Number.isFinite(parts) ? parts : 0);
  }, 0);
  const ratingSummary = requests.reduce(
    (summary, request) => {
      const rating = Number(request.rating);
      if (Number.isFinite(rating) && rating >= 1 && rating <= 5) {
        summary.total += rating;
        summary.count += 1;
      }
      return summary;
    },
    { total: 0, count: 0 },
  );
  const averageRating = ratingSummary.count > 0
    ? ratingSummary.total / ratingSummary.count
    : 0;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const sevenDaysFromNow = new Date(startOfToday);
  sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
  sevenDaysFromNow.setHours(23, 59, 59, 999);
  const dashboardDuePlans = dashboardPreventivePlans.filter((plan) => {
    if (!plan.isActive) return false;
    const dueAt = new Date(plan.nextDueAt);
    return !Number.isNaN(dueAt.getTime()) && dueAt <= sevenDaysFromNow;
  });
  const dashboardOverduePlans = dashboardDuePlans.filter(
    (plan) => new Date(plan.nextDueAt) < startOfToday,
  );
  const dashboardUpcomingPlans = dashboardDuePlans.length - dashboardOverduePlans.length;

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
    { id: 'dashboard',   label: 'لوحة التحكم',    icon: LayoutDashboard },
    { id: 'properties',  label: 'العقارات',        icon: Building2 },
    { id: 'units',       label: 'الوحدات',         icon: Home },
    { id: 'requests',    label: 'البلاغات',        icon: Wrench },
    { id: 'preventive',  label: 'الصيانة الوقائية', icon: CalendarCheck2 },
    { id: 'technicians', label: 'الفنيون',         icon: Users },
    { id: 'users',       label: 'المستخدمون',      icon: Shield },
    { id: 'audit',       label: 'سجل العمليات',    icon: ClipboardList },
    { id: 'settings',    label: 'إعدادات الشركة',  icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-muted/30 flex font-sans" dir="rtl">

      {/* Sidebar */}
      <aside className="w-16 md:w-64 bg-card border-l border-border flex flex-col fixed inset-y-0 right-0 z-10">
        <div className="p-3 md:p-5 border-b border-border" style={{ backgroundColor: user?.brandColor ?? '#0891b2' }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 text-white font-bold text-xl flex items-center justify-center shadow-sm">م</div>
            <div className="hidden md:block">
              <p className="font-bold text-sm text-white">{user?.organizationName ?? 'مِرفق'}</p>
              <p className="text-xs text-white/70">إدارة العقارات</p>
            </div>
          </div>
        </div>

        <div className="hidden md:block p-4 border-b border-border">
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

        <nav className="flex-1 p-2 md:p-3 space-y-1 overflow-y-auto">
          {navItems.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveNav(id)}
              title={label}
              className={`w-full flex items-center justify-center md:justify-start gap-3 px-2 md:px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                activeNav === id
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="hidden md:inline">{label}</span>
            </button>
          ))}
        </nav>

        <div className="p-2 md:p-3 border-t border-border">
          <button
            onClick={() => doLogout()}
            title="تسجيل الخروج"
            className="w-full flex items-center justify-center md:justify-start gap-3 px-2 md:px-3 py-2.5 rounded-xl text-sm text-destructive hover:bg-destructive/10 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden md:inline">تسجيل الخروج</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 mr-16 md:mr-64 p-3 md:p-6 min-h-screen min-w-0">

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

            {/* Business insights */}
            <section aria-labelledby="business-insights-title" className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 id="business-insights-title" className="font-semibold">مؤشرات التشغيل</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">التكلفة، رضا السكان، والاستحقاقات القريبة</p>
                </div>
                <span className="rounded-full bg-primary/10 px-3 py-1 text-[11px] font-medium text-primary">محدّثة الآن</span>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <article className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">إجمالي تكاليف الصيانة</p>
                      <p className="mt-1 text-2xl font-bold tracking-tight">
                        {reqLoading
                          ? '—'
                          : totalMaintenanceCost.toLocaleString('ar-SA', { maximumFractionDigits: 2 })}
                        {!reqLoading && <span className="mr-1 text-sm font-semibold text-muted-foreground">ر.س</span>}
                      </p>
                    </div>
                    <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                      <CircleDollarSign className="h-5 w-5" />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
                    <span>عمالة: {totalLaborCost.toLocaleString('ar-SA', { maximumFractionDigits: 2 })} ر.س</span>
                    <span>قطع: {totalPartsCost.toLocaleString('ar-SA', { maximumFractionDigits: 2 })} ر.س</span>
                  </div>
                </article>

                <article className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">متوسط رضا السكان</p>
                      <p className="mt-1 flex items-baseline gap-1 text-2xl font-bold tracking-tight">
                        {reqLoading ? '—' : ratingSummary.count > 0 ? averageRating.toFixed(1) : 'لا يوجد'}
                        {!reqLoading && ratingSummary.count > 0 && <span className="text-sm font-semibold text-muted-foreground">/ 5</span>}
                      </p>
                    </div>
                    <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
                      <Star className="h-5 w-5 fill-current" />
                    </div>
                  </div>
                  <p className="border-t border-border pt-3 text-xs text-muted-foreground">
                    {reqLoading
                      ? 'جارٍ حساب التقييمات…'
                      : ratingSummary.count > 0
                        ? `بناءً على ${ratingSummary.count.toLocaleString('ar-SA')} تقييم`
                        : 'لم تُسجّل تقييمات بعد'}
                  </p>
                </article>

                <article className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">استحقاقات الصيانة خلال 7 أيام</p>
                      <p className="mt-1 text-2xl font-bold tracking-tight">
                        {dashboardPlansLoading || dashboardPlansError
                          ? '—'
                          : dashboardDuePlans.length.toLocaleString('ar-SA')}
                        {!dashboardPlansLoading && !dashboardPlansError && <span className="mr-1 text-sm font-semibold text-muted-foreground">خطة</span>}
                      </p>
                    </div>
                    <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
                      <CalendarCheck2 className="h-5 w-5" />
                    </div>
                  </div>
                  <p className="border-t border-border pt-3 text-xs text-muted-foreground">
                    {dashboardPlansLoading
                      ? 'جارٍ تحميل الخطط…'
                      : dashboardPlansError
                        ? 'تعذّر تحميل خطط الصيانة'
                        : `${dashboardOverduePlans.length.toLocaleString('ar-SA')} متأخرة · ${dashboardUpcomingPlans.toLocaleString('ar-SA')} قادمة`}
                  </p>
                </article>
              </div>
            </section>

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

        {/* ── Preventive maintenance ── */}
        {activeNav === 'preventive' && <PreventiveMaintenanceView technicians={technicians} />}

        {/* ── Users ── */}
        {activeNav === 'users' && <UsersView />}

        {/* ── Audit ── */}
        {activeNav === 'audit' && <AuditView />}

        {/* ── Settings ── */}
        {activeNav === 'settings' && <SettingsView />}

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
