import { useState } from 'react';
import { useLocation } from 'wouter';
import {
  LayoutDashboard, Wrench, Users, Settings, LogOut,
  Search, ChevronLeft, AlertCircle, Clock, CheckCircle2,
  RefreshCcw, Building2, Home
} from 'lucide-react';
import {
  useGetDashboardStats,
  useGetRequests,
  useGetTechnicians,
  useUpdateRequest,
  useLogout,
  getGetRequestsQueryKey,
  getGetDashboardStatsQueryKey,
} from '@workspace/api-client-react';
import type { MaintenanceRequest, TechnicianProfile } from '@workspace/api-client-react';
import { useAuth } from '@/context/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import { ProtectedRoute } from '@/components/ProtectedRoute';

const STATUS_STYLES: Record<string, string> = {
  'معلّقة':      'bg-amber-100 text-amber-800 border-amber-200',
  'قيد التنفيذ': 'bg-blue-100 text-blue-800 border-blue-200',
  'مكتملة':      'bg-emerald-100 text-emerald-800 border-emerald-200',
};
const PRIORITY_STYLES: Record<string, string> = {
  'عاجل': 'bg-red-100 text-red-800 border-red-200',
  'عادي': 'bg-slate-100 text-slate-700 border-slate-200',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_STYLES[status] ?? 'bg-muted text-muted-foreground border-border'}`}>
      {status === 'معلّقة' && <Clock className="w-3 h-3" />}
      {status === 'قيد التنفيذ' && <RefreshCcw className="w-3 h-3" />}
      {status === 'مكتملة' && <CheckCircle2 className="w-3 h-3" />}
      {status}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${PRIORITY_STYLES[priority] ?? 'bg-muted text-muted-foreground border-border'}`}>
      {priority}
    </span>
  );
}

function ManagerContent() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRequest, setSelectedRequest] = useState<MaintenanceRequest | null>(null);
  const [activeNav, setActiveNav] = useState<'dashboard' | 'requests' | 'technicians'>('dashboard');
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
      }
    }
  });

  const { mutate: doLogout } = useLogout({
    mutation: {
      onSuccess() {
        logout();
        setLocation('/login');
      }
    }
  });

  const filtered = requests.filter(r =>
    r.title.includes(searchQuery) ||
    r.residentName?.includes(searchQuery) ||
    r.unitNumber?.includes(searchQuery) ||
    r.status.includes(searchQuery)
  );

  const navItems = [
    { id: 'dashboard', label: 'لوحة التحكم', icon: LayoutDashboard },
    { id: 'requests',  label: 'البلاغات',     icon: Wrench },
    { id: 'technicians', label: 'الفنيون',    icon: Users },
  ] as const;

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

        <nav className="flex-1 p-3 space-y-1">
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

      {/* Main Content */}
      <main className="flex-1 mr-64 p-6 min-h-screen">

        {/* Dashboard View */}
        {activeNav === 'dashboard' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div>
              <h1 className="text-2xl font-bold text-foreground">لوحة التحكم</h1>
              <p className="text-muted-foreground text-sm mt-1">نظرة عامة على العقارات والبلاغات</p>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {statsLoading ? (
                Array.from({length: 4}).map((_, i) => (
                  <div key={i} className="bg-card border border-border rounded-2xl p-4 animate-pulse h-24" />
                ))
              ) : (
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
              )}
            </div>

            {/* Secondary Stats */}
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

            {/* Recent Requests */}
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between p-4 border-b border-border">
                <h2 className="font-semibold">أحدث البلاغات</h2>
                <button onClick={() => setActiveNav('requests')} className="text-xs text-primary hover:underline flex items-center gap-1">
                  عرض الكل <ChevronLeft className="w-3 h-3" />
                </button>
              </div>
              <RequestsTable
                requests={requests.slice(0, 5)}
                technicians={technicians}
                isLoading={reqLoading}
                onSelect={setSelectedRequest}
                isUpdating={isUpdating}
                updateRequest={updateRequest}
              />
            </div>
          </div>
        )}

        {/* Requests View */}
        {activeNav === 'requests' && (
          <div className="space-y-5 animate-in fade-in duration-300">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold">البلاغات</h1>
                <p className="text-muted-foreground text-sm mt-1">إدارة جميع بلاغات الصيانة</p>
              </div>
              <button onClick={() => refetchReq()} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
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
              <RequestsTable
                requests={filtered}
                technicians={technicians}
                isLoading={reqLoading}
                onSelect={setSelectedRequest}
                isUpdating={isUpdating}
                updateRequest={updateRequest}
              />
            </div>
          </div>
        )}

        {/* Technicians View */}
        {activeNav === 'technicians' && (
          <div className="space-y-5 animate-in fade-in duration-300">
            <div>
              <h1 className="text-2xl font-bold">الفنيون</h1>
              <p className="text-muted-foreground text-sm mt-1">قائمة فنيي الصيانة وأعمالهم الحالية</p>
            </div>

            {techLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Array.from({length: 3}).map((_, i) => (
                  <div key={i} className="bg-card border border-border rounded-2xl p-5 animate-pulse h-28" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {technicians.map(tech => (
                  <TechnicianCard key={tech.id} tech={tech} />
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

      {/* Request Detail Modal */}
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

function RequestsTable({
  requests, technicians, isLoading, onSelect, isUpdating, updateRequest
}: {
  requests: MaintenanceRequest[];
  technicians: TechnicianProfile[];
  isLoading: boolean;
  onSelect: (r: MaintenanceRequest) => void;
  isUpdating: boolean;
  updateRequest: (args: { id: string; data: { status?: string; technicianId?: string | null } }) => void;
}) {
  if (isLoading) {
    return (
      <div className="divide-y divide-border">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="p-4 animate-pulse flex gap-4">
            <div className="h-4 bg-muted rounded w-1/3" />
            <div className="h-4 bg-muted rounded w-1/4" />
            <div className="h-4 bg-muted rounded w-1/5" />
          </div>
        ))}
      </div>
    );
  }

  if (requests.length === 0) {
    return (
      <div className="text-center py-10 text-muted-foreground">
        <Wrench className="w-8 h-8 mx-auto mb-2 opacity-30" />
        <p className="text-sm">لا توجد بلاغات</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-border">
      {requests.map(req => (
        <div key={req.id} className="p-4 hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => onSelect(req)}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <PriorityBadge priority={req.priority} />
                <StatusBadge status={req.status} />
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
  );
}

function TechnicianCard({ tech }: { tech: TechnicianProfile }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-5 flex items-center gap-4">
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
  );
}

function RequestDetailModal({
  request, technicians, isUpdating, onClose, onUpdate
}: {
  request: MaintenanceRequest;
  technicians: TechnicianProfile[];
  isUpdating: boolean;
  onClose: () => void;
  onUpdate: (id: string, data: { status?: string; technicianId?: string | null }) => void;
}) {
  const [status, setStatus] = useState(request.status);
  const [technicianId, setTechnicianId] = useState(request.technicianId ?? '');

  function handleSave() {
    onUpdate(request.id, {
      status,
      technicianId: technicianId || null,
    });
  }

  return (
    <div className="fixed inset-0 bg-background/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl w-full max-w-lg shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="font-bold text-lg">تفاصيل البلاغ</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">✕</button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <PriorityBadge priority={request.priority} />
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

          {/* Status */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">الحالة</label>
            <select
              value={status}
              onChange={e => setStatus(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="معلّقة">معلّقة</option>
              <option value="قيد التنفيذ">قيد التنفيذ</option>
              <option value="مكتملة">مكتملة</option>
            </select>
          </div>

          {/* Assign Technician */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">الفني المكلف</label>
            <select
              value={technicianId}
              onChange={e => setTechnicianId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">— لم يُعيَّن —</option>
              {technicians.map(t => (
                <option key={t.id} value={t.id}>{t.name} ({t.specialty})</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex gap-3 p-5 border-t border-border">
          <button
            onClick={handleSave}
            disabled={isUpdating}
            className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {isUpdating && <span className="w-4 h-4 border-2 border-primary-foreground/40 border-t-primary-foreground rounded-full animate-spin" />}
            حفظ التغييرات
          </button>
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors"
          >
            إلغاء
          </button>
        </div>
      </div>
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
