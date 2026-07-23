import { useState } from 'react';
import { useLocation } from 'wouter';
import { CheckCircle2, Clock, Wrench, LogOut, RefreshCcw, MessageSquare, Send, ChevronDown, ChevronUp } from 'lucide-react';
import {
  useGetRequests,
  useUpdateRequest,
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

  return (
    <div className="mt-4 pt-4 border-t border-border/50 space-y-3">
      <h4 className="text-xs font-semibold text-muted-foreground uppercase flex items-center gap-1.5">
        <MessageSquare className="w-3.5 h-3.5" /> التعليقات
      </h4>

      {isLoading ? (
        <div className="space-y-2">
          {[1,2].map(i => <div key={i} className="h-7 bg-muted animate-pulse rounded-lg" />)}
        </div>
      ) : comments.length === 0 ? (
        <p className="text-xs text-muted-foreground">لا توجد تعليقات بعد</p>
      ) : (
        <div className="space-y-2 max-h-36 overflow-y-auto">
          {comments.map(c => (
            <div key={c.id} className="bg-muted/40 rounded-lg px-3 py-2">
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
          onKeyDown={e => e.key === 'Enter' && !isPending && comment.trim() && addComment({ requestId, data: { content: comment.trim() } })}
          placeholder="اكتب ملاحظة أو تحديثاً..."
          className="flex-1 px-3 py-2 rounded-lg border border-input bg-background text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <button
          onClick={() => {
            const t = comment.trim();
            if (t) addComment({ requestId, data: { content: t } });
          }}
          disabled={isPending || !comment.trim()}
          className="px-3 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

function JobCard({ job, onComplete }: { job: MaintenanceRequest; onComplete: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const isCompleted = job.status === 'مكتملة';

  return (
    <div className={`bg-card border rounded-2xl overflow-hidden transition-all ${isCompleted ? 'border-emerald-200 opacity-75' : 'border-border'}`}>
      <button
        className="w-full text-right p-4 hover:bg-muted/20 transition-colors"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
            isCompleted ? 'bg-emerald-100 text-emerald-600' : 'bg-blue-100 text-blue-600'
          }`}>
            {isCompleted ? <CheckCircle2 className="w-5 h-5" /> : <Wrench className="w-5 h-5" />}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${
                job.priority === 'عاجل'
                  ? 'bg-red-100 text-red-700 border-red-200'
                  : 'bg-slate-100 text-slate-600 border-slate-200'
              }`}>{job.priority}</span>
              <span className="text-xs text-muted-foreground">{job.category}</span>
            </div>
            <p className="text-sm font-semibold">{job.title}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {job.residentName} · {job.unitNumber}
            </p>
          </div>

          <div className="flex-shrink-0">
            {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-border/50 pt-3 space-y-3">
          <p className="text-sm text-muted-foreground leading-relaxed">{job.description}</p>

          {!isCompleted && (
            <button
              onClick={() => onComplete(job.id)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-600 transition-colors"
            >
              <CheckCircle2 className="w-4 h-4" />
              تحديد كمكتملة
            </button>
          )}

          <CommentsPanel requestId={job.id} />
        </div>
      )}
    </div>
  );
}

function TechnicianContent() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const qc = useQueryClient();

  const { data: jobs = [], isLoading, refetch } = useGetRequests();

  const { mutate: updateRequest } = useUpdateRequest({
    mutation: {
      onSuccess() {
        qc.invalidateQueries({ queryKey: getGetRequestsQueryKey() });
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

  function completeJob(id: string) {
    updateRequest({ id, data: { status: 'مكتملة' } });
  }

  const activeJobs     = jobs.filter(j => j.status !== 'مكتملة');
  const completedJobs  = jobs.filter(j => j.status === 'مكتملة');

  return (
    <div className="min-h-screen bg-muted/30 font-sans" dir="rtl">

      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-10">
        <div className="max-w-xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary text-primary-foreground font-bold text-lg flex items-center justify-center">م</div>
            <div>
              <p className="text-sm font-bold leading-tight">{user?.name}</p>
              <p className="text-xs text-muted-foreground">فني صيانة</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => refetch()} className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground">
              <RefreshCcw className="w-4 h-4" />
            </button>
            <button
              onClick={() => doLogout()}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-destructive transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-xl mx-auto px-4 py-6 space-y-6">

        {/* Summary */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-card border border-border rounded-2xl p-4 text-center">
            <p className="text-3xl font-bold text-blue-600">{activeJobs.length}</p>
            <p className="text-xs text-muted-foreground mt-1 flex items-center justify-center gap-1">
              <Clock className="w-3.5 h-3.5" /> مهام نشطة
            </p>
          </div>
          <div className="bg-card border border-border rounded-2xl p-4 text-center">
            <p className="text-3xl font-bold text-emerald-600">{completedJobs.length}</p>
            <p className="text-xs text-muted-foreground mt-1 flex items-center justify-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> مكتملة
            </p>
          </div>
        </div>

        {/* Active Jobs */}
        <div className="space-y-3">
          <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
            المهام النشطة
          </h2>

          {isLoading ? (
            Array.from({length: 3}).map((_,i) => (
              <div key={i} className="bg-card border border-border rounded-2xl p-4 animate-pulse h-20" />
            ))
          ) : activeJobs.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-emerald-400" />
              <p className="text-sm">لا توجد مهام نشطة حالياً</p>
            </div>
          ) : (
            activeJobs.map(job => (
              <JobCard key={job.id} job={job} onComplete={completeJob} />
            ))
          )}
        </div>

        {/* Completed Jobs */}
        {completedJobs.length > 0 && (
          <div className="space-y-3">
            <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
              المكتملة ({completedJobs.length})
            </h2>
            {completedJobs.map(job => (
              <JobCard key={job.id} job={job} onComplete={completeJob} />
            ))}
          </div>
        )}

      </div>
    </div>
  );
}

export default function TechnicianDashboard() {
  return (
    <ProtectedRoute allowedRoles={['technician']}>
      <TechnicianContent />
    </ProtectedRoute>
  );
}
