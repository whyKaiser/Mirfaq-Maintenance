import { useState } from 'react';
import { Link } from 'wouter';
import { 
  Building2, 
  LogOut, 
  LayoutDashboard, 
  Wrench, 
  Users, 
  Settings, 
  FileText,
  Search,
  Bell,
  CheckCircle2,
  Clock,
  AlertCircle
} from 'lucide-react';
import { mockManagerRequests, mockTechnicians, MaintenanceRequest } from '@/data/demo';

export default function ManagerDashboard() {
  const [requests] = useState<MaintenanceRequest[]>(mockManagerRequests);
  const [searchQuery, setSearchQuery] = useState('');

  const stats = {
    total: requests.length,
    pending: requests.filter(r => r.status === 'معلّقة').length,
    inProgress: requests.filter(r => r.status === 'قيد التنفيذ').length,
    completed: requests.filter(r => r.status === 'مكتملة').length,
  };

  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'معلّقة': return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'قيد التنفيذ': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'مكتملة': return 'bg-green-100 text-green-700 border-green-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const getPriorityBadge = (priority: string) => {
    return priority === 'عاجل' 
      ? 'text-red-600 bg-red-50 border-red-100' 
      : 'text-gray-600 bg-gray-50 border-gray-200';
  };

  return (
    <div className="min-h-screen bg-muted/30 flex font-sans">
      
      {/* Sidebar (Right side for RTL) */}
      <aside className="w-64 bg-sidebar text-sidebar-foreground flex flex-col hidden md:flex sticky top-0 h-screen border-l border-sidebar-border shadow-xl">
        <div className="p-6 border-b border-sidebar-border">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-primary text-primary-foreground flex items-center justify-center font-bold text-lg">م</div>
            <span className="text-xl font-bold tracking-tight">مِرفق</span>
          </Link>
        </div>
        
        <div className="p-6">
          <div className="flex items-center gap-3 mb-6 bg-sidebar-accent/50 p-3 rounded-lg border border-sidebar-accent">
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
              أع
            </div>
            <div>
              <p className="font-semibold text-sm">أحمد العمري</p>
              <p className="text-xs text-sidebar-foreground/70">مدير العقار</p>
            </div>
          </div>

          <nav className="space-y-1.5">
            {[
              { icon: LayoutDashboard, label: 'لوحة التحكم', active: true },
              { icon: FileText, label: 'البلاغات' },
              { icon: Wrench, label: 'الفنيون' },
              { icon: Building2, label: 'الوحدات' },
              { icon: Users, label: 'التقارير' },
              { icon: Settings, label: 'الإعدادات' },
            ].map((item, i) => (
              <button 
                key={i}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-md text-sm font-medium transition-colors ${
                  item.active 
                    ? 'bg-primary text-primary-foreground' 
                    : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                }`}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="mt-auto p-6 border-t border-sidebar-border">
          <Link 
            href="/login" 
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-md text-sm font-medium text-sidebar-foreground/80 hover:bg-destructive/10 hover:text-destructive transition-colors"
          >
            <LogOut className="w-4 h-4 rtl:rotate-180" />
            تسجيل الخروج
          </Link>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* Top Header */}
        <header className="h-16 bg-card border-b flex items-center justify-between px-6 sticky top-0 z-10">
          <h1 className="font-bold text-lg hidden md:block">نظرة عامة</h1>
          <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end">
            {/* Mobile menu toggle would go here */}
            <div className="relative md:w-64">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input 
                type="text" 
                placeholder="ابحث عن بلاغ، وحدة..." 
                className="w-full pl-3 pr-10 py-2 bg-muted/50 border-transparent rounded-md text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <button className="relative p-2 rounded-full hover:bg-muted transition-colors text-muted-foreground">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-destructive border-2 border-card"></span>
            </button>
          </div>
        </header>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-auto p-6 space-y-6">
          
          {/* Stats Bar */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'إجمالي البلاغات', val: stats.total, icon: FileText, c: 'text-foreground' },
              { label: 'معلّقة', val: stats.pending, icon: AlertCircle, c: 'text-amber-600' },
              { label: 'قيد التنفيذ', val: stats.inProgress, icon: Clock, c: 'text-blue-600' },
              { label: 'مكتملة', val: stats.completed, icon: CheckCircle2, c: 'text-green-600' }
            ].map((stat, i) => (
              <div key={i} className="bg-card p-5 rounded-xl border shadow-sm flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">{stat.label}</p>
                  <p className={`text-3xl font-bold ${stat.c}`}>{stat.val}</p>
                </div>
                <div className={`p-3 rounded-lg ${stat.c === 'text-foreground' ? 'bg-primary/10 text-primary' : 'bg-muted'}`}>
                  <stat.icon className={`w-5 h-5 ${stat.c}`} />
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Requests Table */}
            <div className="lg:col-span-2 bg-card rounded-xl border shadow-sm flex flex-col">
              <div className="p-5 border-b flex items-center justify-between">
                <h2 className="font-bold text-lg">أحدث البلاغات</h2>
                <button className="text-sm font-medium text-primary hover:underline">عرض الكل</button>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-right">
                  <thead className="bg-muted/50 text-muted-foreground">
                    <tr>
                      <th className="px-5 py-3 font-medium border-b">رقم البلاغ</th>
                      <th className="px-5 py-3 font-medium border-b">الوحدة</th>
                      <th className="px-5 py-3 font-medium border-b">الوصف</th>
                      <th className="px-5 py-3 font-medium border-b">الفني</th>
                      <th className="px-5 py-3 font-medium border-b">الحالة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {requests.length > 0 ? (
                      requests.map((req) => (
                        <tr key={req.id} className="hover:bg-muted/30 transition-colors">
                          <td className="px-5 py-4 font-mono text-xs">{req.id}</td>
                          <td className="px-5 py-4 font-medium">{req.unit}</td>
                          <td className="px-5 py-4">
                            <div className="flex flex-col gap-1">
                              <span>{req.category}</span>
                              <span className="text-xs text-muted-foreground truncate max-w-[150px]">{req.description}</span>
                            </div>
                          </td>
                          <td className="px-5 py-4 text-muted-foreground">{req.technicianName || '—'}</td>
                          <td className="px-5 py-4">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusBadge(req.status)}`}>
                              {req.status}
                            </span>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="px-5 py-12 text-center text-muted-foreground">
                          لا توجد بلاغات حالياً
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Technicians Overview */}
            <div className="bg-card rounded-xl border shadow-sm flex flex-col">
              <div className="p-5 border-b">
                <h2 className="font-bold text-lg">حالة الفنيين</h2>
              </div>
              <div className="p-5 flex flex-col gap-4">
                {mockTechnicians.map((tech) => (
                  <div key={tech.id} className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/30 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                        {tech.name.charAt(0)}
                      </div>
                      <div>
                        <p className="font-medium text-sm">{tech.name}</p>
                        <p className="text-xs text-muted-foreground">{tech.specialty}</p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-medium ${
                        tech.status === 'متاح' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {tech.status}
                      </span>
                      {tech.activeJobsCount > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {tech.activeJobsCount} مهام
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                
                <button className="mt-2 w-full py-2 border-2 border-dashed rounded-lg text-sm font-medium text-muted-foreground hover:border-primary hover:text-primary transition-colors flex items-center justify-center gap-2">
                  <Users className="w-4 h-4" />
                  إدارة الفنيين
                </button>
              </div>
            </div>

          </div>
        </div>
      </main>
    </div>
  );
}
