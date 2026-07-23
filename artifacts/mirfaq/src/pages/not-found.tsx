import { Link } from 'wouter';
import { Home } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-[100dvh] w-full flex items-center justify-center bg-gray-50 dark:bg-slate-900">
      <div className="text-center max-w-md px-6">
        <h1 className="text-9xl font-bold text-primary mb-4">404</h1>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
          الصفحة غير موجودة
        </h2>
        <p className="text-gray-600 dark:text-gray-400 mb-8 leading-relaxed">
          عذراً، لم نتمكن من العثور على الصفحة التي تبحث عنها. ربما تم نقلها أو حذفها.
        </p>
        <Link 
          href="/" 
          className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-6 py-3 text-sm font-medium text-white shadow-sm hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 transition-colors"
          data-testid="link-home"
        >
          <Home className="w-4 h-4" />
          <span>العودة للرئيسية</span>
        </Link>
      </div>
    </div>
  );
}
