import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export interface NotificationItem {
  id: string;
  type: string;
  typeLabel: string;
  title: string;
  body: string;
  entityType: string | null;
  entityId: string | null;
  isRead: boolean;
  createdAt: string;
}

interface NotificationsResponse {
  items: NotificationItem[];
  unreadCount: number;
}

const POLL_INTERVAL_MS = 60_000;

async function fetchNotifications(): Promise<NotificationsResponse> {
  const res = await fetch('/api/notifications?limit=30', { credentials: 'include' });
  if (!res.ok) throw new Error('تعذر تحميل الإشعارات');
  return res.json();
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return 'الآن';
  if (minutes < 60) return `قبل ${minutes} دقيقة`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `قبل ${hours} ساعة`;
  const days = Math.round(hours / 24);
  return `قبل ${days} يوم`;
}

export function NotificationBell({ onOpenEntity }: { onOpenEntity?: (n: NotificationItem) => void }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ['notifications'],
    queryFn: fetchNotifications,
    refetchInterval: POLL_INTERVAL_MS,
  });

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`/api/notifications/${encodeURIComponent(id)}/read`, {
        method: 'POST',
        credentials: 'include',
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      await fetch('/api/notifications/read-all', { method: 'POST', credentials: 'include' });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const unreadCount = data?.unreadCount ?? 0;
  const items = data?.items ?? [];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="الإشعارات"
          aria-label={unreadCount > 0 ? `الإشعارات، ${unreadCount} غير مقروء` : 'الإشعارات'}
          className="relative w-full flex items-center justify-center md:justify-start gap-3 px-2 md:px-3 py-2.5 rounded-xl text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <span className="relative">
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-1.5 -left-1.5 min-w-[1.05rem] h-[1.05rem] px-1 rounded-full bg-destructive text-destructive-foreground text-[0.625rem] font-bold flex items-center justify-center">
                {unreadCount > 9 ? '٩+' : unreadCount}
              </span>
            )}
          </span>
          <span className="hidden md:inline">الإشعارات</span>
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-80 p-0" dir="rtl">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <p className="text-sm font-semibold">الإشعارات</p>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
              className="text-xs text-primary hover:underline flex items-center gap-1 disabled:opacity-50"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              تعليم الكل كمقروء
            </button>
          )}
        </div>

        <div className="max-h-80 overflow-y-auto">
          {items.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">لا توجد إشعارات</p>
          )}
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                if (!item.isRead) markRead.mutate(item.id);
                if (onOpenEntity) {
                  onOpenEntity(item);
                  setOpen(false);
                }
              }}
              className={`w-full text-right px-3 py-2.5 border-b border-border last:border-b-0 hover:bg-muted transition-colors ${
                item.isRead ? '' : 'bg-primary/5'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium leading-snug">{item.title}</p>
                {!item.isRead && <span className="mt-1 w-2 h-2 shrink-0 rounded-full bg-primary" />}
              </div>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{item.body}</p>
              <p className="text-[0.7rem] text-muted-foreground/70 mt-1">
                {item.typeLabel} · {relativeTime(item.createdAt)}
              </p>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default NotificationBell;
