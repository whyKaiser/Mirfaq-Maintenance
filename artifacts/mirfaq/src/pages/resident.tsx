import { useState, useRef } from 'react';
import { useLocation } from 'wouter';
import { Plus, X, Clock, RefreshCcw, CheckCircle2, LogOut, Send, MessageSquare, Paperclip, Upload, Trash2, Image, Star } from 'lucide-react';
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
import { NotificationBell } from '@/components/NotificationBell';

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

type RatedMaintenanceRequest = MaintenanceRequest & {
  rating?: number | null;
  ratingComment?: string | null;
};

function RatingPanel({ request }: { request: RatedMaintenanceRequest }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState('');
  const qc = useQueryClient();

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (rating < 1 || rating > 5 || isSubmitting) return;

    setIsSubmitting(true);
    setError('');
    try {
      const response = await fetch(`/api/requests/${request.id}/rating`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating, comment: comment.trim() || undefined }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string; message?: string } | null;
        throw new Error(body?.error ?? body?.message ?? 'تعذر حفظ التقييم');
      }
      setIsSubmitted(true);
      qc.invalidateQueries({ queryKey: getGetRequestsQueryKey() });
    } catch (submitError: unknown) {
      setError(submitError instanceof Error ? submitError.message : 'تعذر حفظ التقييم');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (request.rating) {
    return (
      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/70 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-amber-900">تقييمك للخدمة</p>
          <div className="flex gap-0.5" dir="ltr" aria-label={`${request.rating} من 5`}>
            {[1, 2, 3, 4, 5].map(value => (
              <Star
                key={value}
                className={`h-4 w-4 ${value <= request.rating! ? 'fill-amber-400 text-amber-400' : 'text-amber-200'}`}
              />
            ))}
          </div>
        </div>
        {request.ratingComment && (
          <p className="mt-2 text-xs leading-5 text-amber-800">{request.ratingComment}</p>
        )}
      </div>
    );
  }

  if (isSubmitted) {
    return (
      <div className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-700">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        شكراً! تم حفظ تقييمك.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-bold">كيف كانت خدمة الصيانة؟</p>
          <p className="text-xs text-muted-foreground">تقييمك يساعدنا نحسّن الخدمة.</p>
        </div>
        <div className="mt-2 flex w-fit gap-1 sm:mt-0" dir="ltr" role="radiogroup" aria-label="اختر التقييم من 5">
          {[1, 2, 3, 4, 5].map(value => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={rating === value}
              aria-label={`${value} من 5`}
              onClick={() => setRating(value)}
              className="rounded-lg p-1.5 transition hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-400/50"
            >
              <Star
                className={`h-6 w-6 transition ${
                  value <= rating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/35'
                }`}
              />
            </button>
          ))}
        </div>
      </div>

      <textarea
        value={comment}
        onChange={event => setComment(event.target.value)}
        rows={2}
        maxLength={500}
        placeholder="اكتب ملاحظتك (اختياري)"
        className="mt-3 w-full resize-none rounded-xl border border-input bg-background px-3 py-2.5 text-xs leading-5 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
      />

      {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}

      <button
        type="submit"
        disabled={rating === 0 || isSubmitting}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isSubmitting && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground" />}
        {rating === 0 ? 'اختر عدد النجوم أولاً' : isSubmitting ? 'جاري حفظ التقييم...' : 'إرسال التقييم'}
      </button>
    </form>
  );
}

function RequestCard({ req }: { req: MaintenanceRequest }) {
  const [expanded, setExpanded] = useState(false);
  const ratedRequest = req as RatedMaintenanceRequest;
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
              {req.status === 'مكتملة' && !ratedRequest.rating && (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                  <Star className="h-3 w-3" />
                  بانتظار تقييمك
                </span>
              )}
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
          {req.status === 'مكتملة' && <RatingPanel request={ratedRequest} />}
          <CommentsPanel requestId={req.id} />
        </div>
      )}
    </div>
  );
}

function AttachmentUploader({ requestId, onDone }: { requestId: string; onDone: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploaded, setUploaded] = useState(false);
  const [error, setError] = useState('');

  function handleFiles(picked: FileList | null) {
    if (!picked) return;
    const arr = Array.from(picked).slice(0, 3 - files.length);
    setFiles(prev => [...prev, ...arr].slice(0, 3));
    setError('');
  }

  async function handleUpload() {
    if (files.length === 0) { onDone(); return; }
    setIsUploading(true); setError('');
    try {
      const fd = new FormData();
      files.forEach(f => fd.append('files', f));
      fd.append('attachmentType', 'initial');
      const res = await fetch(`/api/requests/${requestId}/attachments`, {
        method: 'POST',
        credentials: 'include',
        body: fd,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? 'فشل الرفع');
      }
      setUploaded(true);
      setTimeout(onDone, 1500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    }
    setIsUploading(false);
  }

  if (uploaded) return (
    <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center gap-3">
      <Upload className="w-5 h-5 text-emerald-600 flex-shrink-0" />
      <p className="text-sm font-medium text-emerald-700">تم رفع الصور بنجاح!</p>
    </div>
  );

  return (
    <div className="bg-card border border-border rounded-2xl p-4 space-y-3 animate-in slide-in-from-top-2 duration-200">
      <div className="flex items-center gap-2">
        <Paperclip className="w-4 h-4 text-primary" />
        <p className="text-sm font-semibold">أضف صوراً للمشكلة (اختياري)</p>
        <span className="text-xs text-muted-foreground">حتى 3 صور</span>
      </div>

      {files.length < 3 && (
        <button
          onClick={() => fileRef.current?.click()}
          className="w-full border-2 border-dashed border-primary/30 rounded-xl p-3 flex items-center justify-center gap-2 text-sm text-muted-foreground hover:bg-primary/5 transition-colors"
        >
          <Image className="w-4 h-4" />
          اختر صوراً (JPEG / PNG / WebP)
        </button>
      )}
      <input
        ref={fileRef}
        type="file" multiple accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={e => handleFiles(e.target.files)}
      />

      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((f, i) => (
            <div key={i} className="flex items-center gap-1.5 bg-muted rounded-lg px-2.5 py-1.5 text-xs">
              <Image className="w-3 h-3 text-muted-foreground" />
              <span className="max-w-24 truncate">{f.name}</span>
              <button onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive">
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex gap-2">
        <button
          onClick={handleUpload}
          disabled={isUploading}
          className="flex-1 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {isUploading && <span className="w-3.5 h-3.5 border-2 border-primary-foreground/40 border-t-primary-foreground rounded-full animate-spin" />}
          {files.length === 0 ? 'تخطّي' : 'رفع الصور'}
        </button>
        <button onClick={onDone} className="px-4 py-2 rounded-xl border border-border text-sm hover:bg-muted transition-colors">
          لاحقاً
        </button>
      </div>
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
  const [pendingUploadId, setPendingUploadId] = useState<string | null>(null);
  const qc = useQueryClient();

  const { data: requests = [], isLoading } = useGetRequests();

  const { mutate: createRequest, isPending: isCreating } = useCreateRequest({
    mutation: {
      onSuccess(newRequest) {
        qc.invalidateQueries({ queryKey: getGetRequestsQueryKey() });
        setShowForm(false);
        setTitle('');
        setDescription('');
        setCategory('كهرباء');
        setPriority('عادي');
        // Show uploader for initial attachments
        setPendingUploadId(newRequest.id);
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
          <div className="flex items-center gap-1">
            <div className="w-auto"><NotificationBell /></div>
            <button
              onClick={() => doLogout()}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-destructive transition-colors"
            >
              <LogOut className="w-4 h-4" />
              خروج
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">

        {/* Attachment uploader — shown after request created */}
        {pendingUploadId && (
          <AttachmentUploader
            requestId={pendingUploadId}
            onDone={() => setPendingUploadId(null)}
          />
        )}

        {/* New Request Button */}
        {!pendingUploadId && (
          <button
            onClick={() => setShowForm(v => !v)}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-dashed border-primary/40 text-primary hover:bg-primary/5 transition-colors font-medium"
          >
            {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {showForm ? 'إلغاء' : 'بلاغ صيانة جديد'}
          </button>
        )}

        {/* New Request Form */}
        {showForm && !pendingUploadId && (
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
