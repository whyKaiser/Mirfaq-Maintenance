import { useEffect, useState } from 'react';
import { Download, WifiOff, X } from 'lucide-react';

/**
 * Chrome/Edge fire `beforeinstallprompt` with a deferred prompt we can trigger
 * later. The event is not in the DOM lib typings, so it is narrowed here.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'mirfaq:install-dismissed';

/**
 * Renders two lightweight, non-blocking banners:
 *  - an offline notice while the browser reports no connection
 *  - an "install the app" prompt on browsers that support installation
 */
export function PwaStatus() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(DISMISS_KEY) === '1',
  );

  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = () => setIsOffline(false);
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);

    const onInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onInstallPrompt);

    const onInstalled = () => setInstallEvent(null);
    window.addEventListener('appinstalled', onInstalled);

    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
      window.removeEventListener('beforeinstallprompt', onInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  async function install() {
    if (!installEvent) return;
    await installEvent.prompt();
    await installEvent.userChoice;
    setInstallEvent(null);
  }

  function dismissInstall() {
    localStorage.setItem(DISMISS_KEY, '1');
    setDismissed(true);
  }

  return (
    <>
      {isOffline && (
        <div
          dir="rtl"
          role="status"
          className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 bg-amber-500 px-4 py-2 text-sm font-medium text-white"
        >
          <WifiOff className="h-4 w-4" />
          لا يوجد اتصال بالإنترنت — تُعرض آخر بيانات محفوظة
        </div>
      )}

      {installEvent && !dismissed && (
        <div
          dir="rtl"
          className="fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-border bg-card p-3 shadow-lg"
        >
          <div className="flex-1">
            <p className="text-sm font-bold">ثبّت تطبيق مِرفق</p>
            <p className="text-xs text-muted-foreground">وصول أسرع من الشاشة الرئيسية، ويعمل حتى بدون إنترنت.</p>
          </div>
          <button
            type="button"
            onClick={install}
            className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-sm font-bold text-primary-foreground"
          >
            <Download className="h-4 w-4" />
            تثبيت
          </button>
          <button
            type="button"
            onClick={dismissInstall}
            aria-label="إخفاء"
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </>
  );
}

export default PwaStatus;
