import { useState } from 'react';
import { Link } from 'wouter';
import { LogOut, Wrench, CheckCircle2, Clock, MapPin, CheckCircle } from 'lucide-react';
import { mockTechnicianJobs, mockTechnicianCompletedJobs, MaintenanceRequest } from '@/data/demo';

export default function TechnicianDashboard() {
  const [activeJobs, setActiveJobs] = useState<MaintenanceRequest[]>(mockTechnicianJobs);
  const [completedJobs, setCompletedJobs] = useState<MaintenanceRequest[]>(mockTechnicianCompletedJobs);
  const [isAvailable, setIsAvailable] = useState(true);

  const completeJob = (jobId: string) => {
    const job = activeJobs.find(j => j.id === jobId);
    if (!job) return;

    const completedJob = { ...job, status: 'مكتملة' as const };
    setActiveJobs(activeJobs.filter(j => j.id !== jobId));
    setCompletedJobs([completedJob, ...completedJobs]);
  };

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col font-sans">
      
      {/* Navbar */}
      <header className="bg-sidebar text-sidebar-foreground sticky top-0 z-20 shadow-md">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-primary text-primary-foreground flex items-center justify-center font-bold text-lg">م</div>
            <span className="text-xl font-bold hidden sm:block">مِرفق</span>
          </Link>
          
          <div className="flex items-center gap-4">
            <div className="text-sm text-left">
              <p className="font-semibold text-sidebar-foreground">محمد الغامدي</p>
              <p className="text-xs text-sidebar-foreground/70">فني سباكة</p>
            </div>
            <div className="w-px h-8 bg-sidebar-border mx-1"></div>
            <Link 
              href="/login"
              className="p-2 text-sidebar-foreground/70 hover:text-white transition-colors rounded-full hover:bg-sidebar-accent"
              title="تسجيل الخروج"
            >
              <LogOut className="w-5 h-5 rtl:rotate-180" />
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 container mx-auto px-4 py-8 max-w-3xl">
        
        {/* Status Toggle */}
        <div className="bg-card border rounded-xl p-4 mb-8 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full animate-pulse ${isAvailable ? 'bg-green-500' : 'bg-gray-400'}`}></div>
            <div>
              <p className="font-bold text-sm">حالة التوفر</p>
              <p className="text-xs text-muted-foreground">
                {isAvailable ? 'أنت متاح لاستقبال مهام جديدة' : 'أنت مشغول حالياً'}
              </p>
            </div>
          </div>
          <button 
            onClick={() => setIsAvailable(!isAvailable)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${isAvailable ? 'bg-green-500' : 'bg-gray-300'}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isAvailable ? '-translate-x-1' : '-translate-x-6'}`} />
          </button>
        </div>

        {/* Active Jobs */}
        <div className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Clock className="w-5 h-5 text-primary" />
              مهامي اليوم
            </h2>
            <span className="bg-primary/10 text-primary px-2.5 py-0.5 rounded-full text-sm font-bold">
              {activeJobs.length}
            </span>
          </div>

          <div className="space-y-4">
            {activeJobs.length > 0 ? (
              activeJobs.map((job) => (
                <div key={job.id} className="bg-card border-2 border-primary/20 rounded-xl p-5 shadow-sm hover:border-primary/50 transition-colors relative overflow-hidden group">
                  {job.priority === 'عاجل' && (
                    <div className="absolute top-0 right-0 bg-red-500 text-white text-[10px] font-bold px-3 py-1 rounded-bl-lg">
                      عاجل جداً
                    </div>
                  )}
                  
                  <div className="flex flex-col gap-4">
                    <div className="flex justify-between items-start mt-2">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <MapPin className="w-4 h-4 text-muted-foreground" />
                          <h3 className="font-bold text-lg">{job.unit}</h3>
                        </div>
                        <p className="text-muted-foreground font-medium pr-6">{job.description}</p>
                      </div>
                      <span className="font-mono text-xs bg-muted px-2 py-1 rounded">
                        {job.id}
                      </span>
                    </div>

                    <div className="border-t pt-4 mt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="text-sm text-muted-foreground flex gap-4">
                        <span>النوع: <strong className="text-foreground">{job.category}</strong></span>
                        <span>بواسطة: <strong className="text-foreground">الإدارة</strong></span>
                      </div>
                      
                      <button 
                        onClick={() => completeJob(job.id)}
                        className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground px-6 py-2 rounded-lg font-medium shadow hover:bg-primary/90 transition-all active:scale-95"
                      >
                        <CheckCircle className="w-5 h-5" />
                        إتمام المهمة
                      </button>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-12 bg-card border rounded-xl shadow-sm">
                <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 className="w-8 h-8 text-green-500" />
                </div>
                <h3 className="text-xl font-bold mb-2">أحسنت!</h3>
                <p className="text-muted-foreground">لا توجد مهام معلّقة. لقد أنجزت عملك لهذا اليوم.</p>
              </div>
            )}
          </div>
        </div>

        {/* Completed Jobs */}
        {completedJobs.length > 0 && (
          <div>
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2 text-muted-foreground">
              <CheckCircle2 className="w-5 h-5" />
              المهام المكتملة حديثاً
            </h2>
            
            <div className="space-y-3 opacity-70">
              {completedJobs.map((job) => (
                <div key={job.id} className="bg-card/50 border rounded-lg p-4 flex items-center justify-between">
                  <div>
                    <h4 className="font-medium text-sm line-through decoration-muted-foreground/50">{job.unit} — {job.description}</h4>
                    <p className="text-xs text-muted-foreground mt-1">رقم: {job.id}</p>
                  </div>
                  <span className="text-green-600 bg-green-50 px-2.5 py-1 rounded-md text-xs font-bold border border-green-100 flex items-center gap-1">
                    مكتملة
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
