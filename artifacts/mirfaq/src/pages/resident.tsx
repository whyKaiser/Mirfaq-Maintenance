import { useState } from 'react';
import { useLocation } from 'wouter';
import { Plus, X, Clock, RefreshCcw, CheckCircle2, LogOut, Send, MessageSquare } from 'lucide-react';
import {
  useGetRequests,
  useCreateRequest,
  useGetRequestComments,
  useCreateComment,
  useLogout,
  getGetRequestsQueryKey,
  getGetRequestCommentsQueryKey,
} from '@workspace/api-client-react';
import type { MaintenanceRequest } from '@workspace/api-client-react';
import { useAuth } from '@/context/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import { ProtectedRoute } from '@/components/ProtectedRoute';

const STATUS_STYLES: Record<string, { label: string; style: string; icon: React.ReactNode }> = {
  'معلّقة':      { label: 'معلّقة',      style: 'bg-amber-100 text-amber-800 border-amber-200', icon: <Clock className="w-3 h-3" /> },
  'قيد التنفيذ': { label: 'قيد التنفيذ', style: 'bg-blue-100 text-blue-800 border-blue-200',   icon: <RefreshCcw className="w-3 h-3" /> },
  'مكتملة':      { label: 'مكتملة',      style: 'bg-emerald-100 text-emerald-800 border-emerald-200', icon: <CheckCircle2 className="w-3 h-3" /> },
};

const CATEGORIES = ['كهرباء', 'سباكة', 'تكييف', 'أخرى'];
const PRIORITIES = [{ value: 'عادي', label: 'عادي' }, { value: 'عاجل', label: 'عاجل 🔴' }];

function CommentsPanel({ requestId }: { requestId: string }) {
  const [comment, setComment] = useState('');
  const qc = useQueryClient();
  const { data: comments = [], isLoading } = useGetRequestComments(requestId);
  const { mutate: addComment, isPending } = useCreateComment({
    mutation: {
      onSuccess() {
        qc.invalidateQueries({ queryKey: getGetRequestCommentsQueryKey(requestId) });
        setComment('');
      }
    }
  });

  function handleSend() {
    const trimmed = comment.trim();
    if (!trimmed) return;
    addComment({ requestId, data: { content: trimmed } });
  }

  return (
    <div className="mt-4 border-t border-border pt-4 space-y-3">
      <h4 className="text-sm font-semibold flex items-center gap-1.5">
        <MessageSquare className="w-4 h-4" />
        التعليقات
      </h4>

      {isLoading ? (
        <div className="space-y-2">
          {[1,2].map(i => <div key={i} className="h-8 bg-muted animate-pulse rounded-lg" />)}
        </div>
      ) : comments.length === 0 ? (
        <p className="text-xs text-muted-foreground">لا توجد تعليقات بعد</p>
      ) : (
        <div className="space-y-2 max-h-40 overflow-y-auto">
          {comments.map(c => (
            <div key={c.id} className="bg-muted/50 rounded-lg px-3 py-2">
              <p className="text-xs font-semibold text-primary">{c.authorName}</p>
              <p className="text-xs text-foreground mt-0.5 leading-relaxed">{c.content}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <input
          value={comment}
          onChange={e => setComment(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          placeholder="اكتب تعليقاً..."
          className="flex-1 px-3 py-2 rounded-lg border border-input bg-background text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <button
          onClick={handleSend}
          disabled={isPending || !comment.trim()}
          className="px-3 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

function RequestCard({ req }: { req: MaintenanceRequest }) {
  const [expanded, setExpanded] = useState(false);
  const info = STATUS_STYLES[req.status] ?? { label: req.status, style: 'bg-muted text-muted-foreground border-border', icon: null };

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <button
        className="w-full text-right p-4 hover:bg-muted/20 transition-colors"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${info.style}`}>
                {info.icon}{info.label}
              </span>
              {req.priority === 'عاجل' && (
                <span className="px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700 border border-red-200 font-medium">عاجل</span>
              )}
              <span className="text-xs text-muted-foreground">{req.category}</span>
            </div>
            <p className="text-sm font-semibold">{req.title}</p>
            {req.technicianName && (
              <p className="text-xs text-muted-foreground mt-0.5">الفني: {req.technicianName}</p>
            )}
          </div>
          <span className="text-muted-foreground text-xs pt-1 flex-shrink-0">
            {new Date(req.createdAt).toLocaleDateString('ar-SA')}
          </span>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-border/50 pt-3">
          <p className="text-sm text-muted-foreground leading-relaxed">{req.description}</p>
          <CommentsPanel requestId={req.id} />
        </div>
      )}
    </div>
  );
}

function ResidentContent() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('كهرباء');
  const [priority, setPriority] = useState('عادي');
  const qc = useQueryClient();

  const { data: requests = [], isLoading } = useGetRequests();

  const { mutate: createRequest, isPending: isCreating } = useCreateRequest({
    mutation: {
      onSuccess() {
        qc.invalidateQueries({ queryKey: getGetRequestsQueryKey() });
        setShowForm(false);
        setTitle('');
        setDescription('');
        setCategory('كهرباء');
        setPriority('عادي');
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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !description.trim() || !user?.unitId) return;
    createRequest({
      data: { title: title.trim(), description: description.trim(), category, priority, unitId: user.unitId }
    });
  }

  const activeRequests = requests.filter(r => r.status !== 'مكتملة');
  const completedRequests = requests.filter(r => r.status === 'مكتملة');

  return (
    <div className="min-h-screen bg-muted/30 font-sans" dir="rtl">

      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary text-primary-foreground font-bold text-lg flex items-center justify-center">م</div>
            <div>
              <p className="text-sm font-bold leading-tight">{user?.name}</p>
              <p className="text-xs text-muted-foreground">وحدة {requests[0]?.unitNumber ?? '—'}</p>
            </div>
          </div>
          <button
            onClick={() => doLogout()}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-destructive transition-colors"
          >
            <LogOut className="w-4 h-4" />
            خروج
          </button>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">

        {/* New Request Button */}
        <button
          onClick={() => setShowForm(v => !v)}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-dashed border-primary/40 text-primary hover:bg-primary/5 transition-colors font-medium"
        >
          {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showForm ? 'إلغاء' : 'بلاغ صيانة جديد'}
        </button>

        {/* New Request Form */}
        {showForm && (
          <form onSubmit={handleSubmit} className="bg-card border border-border rounded-2xl p-5 space-y-4 animate-in slide-in-from-top-2 duration-200">
            <h2 className="font-bold text-base">تفاصيل البلاغ</h2>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">عنوان المشكلة</label>
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="مثال: تسرب مياه في الحمام"
                required
                className="w-full px-3 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">وصف المشكلة</label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="اشرح المشكلة بالتفصيل..."
                required
                rows={3}
                className="w-full px-3 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">التصنيف</label>
                <select
                  value={category}
                  onChange={e => setCategory(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">الأولوية</label>
                <select
                  value={priority}
                  onChange={e => setPriority(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
            </div>

            {!user?.unitId && (
              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                لم يتم تعيين وحدة لهذا الحساب. تواصل مع مدير العقار.
              </p>
            )}

            <button
              type="submit"
              disabled={isCreating || !user?.unitId}
              className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {isCreating && <span className="w-4 h-4 border-2 border-primary-foreground/40 border-t-primary-foreground rounded-full animate-spin" />}
              إرسال البلاغ
            </button>
          </form>
        )}

        {/* Active Requests */}
        <div className="space-y-3">
          <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
            البلاغات النشطة ({activeRequests.length})
          </h2>

          {isLoading ? (
            Array.from({length:3}).map((_,i) => (
              <div key={i} className="bg-card border border-border rounded-2xl p-4 animate-pulse h-20" />
            ))
          ) : activeRequests.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-emerald-400" />
              <p className="text-sm">لا توجد بلاغات نشطة — كل شيء بخير!</p>
            </div>
          ) : (
            activeRequests.map(req => <RequestCard key={req.id} req={req} />)
          )}
        </div>

        {/* Completed Requests */}
        {completedRequests.length > 0 && (
          <div className="space-y-3">
            <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
              المكتملة ({completedRequests.length})
            </h2>
            {completedRequests.map(req => <RequestCard key={req.id} req={req} />)}
          </div>
        )}

      </div>
    </div>
  );
}

export default function ResidentDashboard() {
  return (
    <ProtectedRoute allowedRoles={['resident']}>
      <ResidentContent />
    </ProtectedRoute>
  );
}
