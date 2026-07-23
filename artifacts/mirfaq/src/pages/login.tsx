import { Link, useLocation } from 'wouter';
import { ArrowRight, Eye, EyeOff, Lock, Mail, AlertCircle } from 'lucide-react';
import { useState } from 'react';
import { useLogin } from '@workspace/api-client-react';
import { useAuth } from '@/context/AuthContext';

const DEMO_ACCOUNTS = [
  { role: 'مدير العقار', email: 'manager@mirfaq.sa',    color: 'bg-blue-500' },
  { role: 'الساكن',       email: 'resident@mirfaq.sa',   color: 'bg-emerald-500' },
  { role: 'الفني',        email: 'technician@mirfaq.sa', color: 'bg-amber-500' },
];

const ROLE_PATHS: Record<string, string> = {
  manager:    '/manager',
  resident:   '/resident',
  technician: '/technician',
};

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const { setUser } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const { mutate: login, isPending } = useLogin({
    mutation: {
      onSuccess(user) {
        // Backend always returns organizationName and brandColor; cast is safe
        setUser(user as import('@/context/AuthContext').ExtAuthUser);
        setLocation(ROLE_PATHS[user.role] ?? '/login');
      },
      onError() {
        setErrorMsg('بيانات الدخول غير صحيحة. تحقق من البريد الإلكتروني وكلمة المرور.');
      },
    }
  });

  function fillDemo(demoEmail: string) {
    setEmail(demoEmail);
    setPassword('Demo123!');
    setErrorMsg('');
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg('');
    if (!email.trim() || !password.trim()) {
      setErrorMsg('يرجى إدخال البريد الإلكتروني وكلمة المرور');
      return;
    }
    login({ data: { email: email.trim(), password } });
  }

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col items-center justify-center p-4 font-sans">

      <Link href="/" className="absolute top-8 right-8 flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors group">
        <ArrowRight className="w-4 h-4 rtl:-scale-x-100 group-hover:translate-x-1 transition-transform" />
        <span className="text-sm font-medium">العودة للرئيسية</span>
      </Link>

      <div className="w-full max-w-md animate-in fade-in slide-in-from-bottom-6 duration-500">

        {/* Logo */}
        <div className="text-center mb-8 space-y-3">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary text-primary-foreground font-bold text-3xl shadow-lg shadow-primary/20">
            م
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">تسجيل الدخول</h1>
          <p className="text-muted-foreground text-sm">مرحباً بك في مِرفق لإدارة الصيانة</p>
        </div>

        {/* Login Form */}
        <div className="bg-card border border-border rounded-2xl shadow-sm p-6 space-y-5 mb-5">
          <form onSubmit={handleSubmit} className="space-y-4">

            {errorMsg && (
              <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2.5">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground" htmlFor="email">
                البريد الإلكتروني
              </label>
              <div className="relative">
                <Mail className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setErrorMsg(''); }}
                  placeholder="you@example.com"
                  className="w-full pr-10 pl-4 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors placeholder:text-muted-foreground/60 text-left"
                  dir="ltr"
                  autoComplete="email"
                  disabled={isPending}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground" htmlFor="password">
                كلمة المرور
              </label>
              <div className="relative">
                <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => { setPassword(e.target.value); setErrorMsg(''); }}
                  placeholder="••••••••"
                  className="w-full pr-10 pl-10 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors placeholder:text-muted-foreground/60"
                  autoComplete="current-password"
                  disabled={isPending}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isPending}
              className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isPending ? (
                <>
                  <span className="w-4 h-4 border-2 border-primary-foreground/40 border-t-primary-foreground rounded-full animate-spin" />
                  جارٍ التحقق...
                </>
              ) : 'دخول'}
            </button>
          </form>
        </div>

        {/* Demo Accounts */}
        <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
          <p className="text-xs font-medium text-muted-foreground text-center uppercase tracking-wide">
            حسابات تجريبية — انقر للملء التلقائي
          </p>
          <div className="space-y-2">
            {DEMO_ACCOUNTS.map(acc => (
              <button
                key={acc.email}
                type="button"
                onClick={() => fillDemo(acc.email)}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg border border-border hover:border-primary/40 hover:bg-muted/50 transition-all text-right group"
              >
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${acc.color}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground">{acc.role}</div>
                  <div className="text-xs text-muted-foreground truncate" dir="ltr">{acc.email}</div>
                </div>
                <span className="text-xs text-muted-foreground/60 group-hover:text-primary transition-colors flex-shrink-0">
                  Demo123!
                </span>
              </button>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
