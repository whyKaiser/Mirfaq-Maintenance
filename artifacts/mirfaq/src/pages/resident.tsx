import { useState } from 'react';
import { Link } from 'wouter';
import { LogOut, Plus, Wrench, Clock, CheckCircle2, AlertCircle } from 'lucide-react';
import { mockResidentRequests, MaintenanceRequest } from '@/data/demo';

export default function ResidentDashboard() {
  const [requests, setRequests] = useState<MaintenanceRequest[]>(mockResidentRequests);
  const [showForm, setShowForm] = useState(false);
  
  // Form State
  const [category, setCategory] = useState('كهرباء');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('عادي');
  const [showToast, setShowToast] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) return;

    const newReq: MaintenanceRequest = {
      id: `REQ-${Math.floor(1000 + Math.random() * 9000)}`,
      unit: 'شقة 3B',
      category: category as any,
      description,
      status: 'معلّقة',
      priority: priority as any,
      date: new Date().toISOString().split('T')[0]
    };

    setRequests([newReq, ...requests]);
    setShowForm(false);
    setDescription('');
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };

  const getStatusIcon = (status: string) => {
    switch(status) {
      case 'معلّقة': return <Clock className="w-5 h-5 text-amber-500" />;
      case 'قيد التنفيذ': return <Wrench className="w-5 h-5 text-blue-500" />;
      case 'مكتملة': return <CheckCircle2 className="w-5 h-5 text-green-500" />;
      default: return <AlertCircle className="w-5 h-5 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'معلّقة': return 'bg-amber-50 border-amber-200';
      case 'قيد التنفيذ': return 'bg-blue-50 border-blue-200';
      case 'مكتملة': return 'bg-green-50 border-green-200';
      default: return 'bg-gray-50 border-gray-200';
    }
  };

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col font-sans">
      
      {/* Navbar */}
      <header className="bg-card border-b sticky top-0 z-20">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-primary text-primary-foreground flex items-center justify-center font-bold text-lg">م</div>
            <span className="text-xl font-bold hidden sm:block">مِرفق</span>
          </Link>
          
          <div className="flex items-center gap-4">
            <div className="text-sm text-left">
              <p className="font-semibold">سارة الزهراني</p>
              <p className="text-xs text-muted-foreground">شقة 3B</p>
            </div>
            <div className="w-px h-8 bg-border mx-1"></div>
            <Link 
              href="/login"
              className="p-2 text-muted-foreground hover:text-destructive transition-colors rounded-full hover:bg-muted"
              title="تسجيل الخروج"
            >
              <LogOut className="w-5 h-5 rtl:rotate-180" />
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 container mx-auto px-4 py-8 max-w-4xl relative">
        
        {/* Toast Notification */}
        {showToast && (
          <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-green-600 text-white px-6 py-3 rounded-lg shadow-lg flex items-center gap-2 animate-in slide-in-from-top-4 fade-in duration-300">
            <CheckCircle2 className="w-5 h-5" />
            <span className="font-medium">تم إرسال بلاغك بنجاح</span>
          </div>
        )}

        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold mb-1">بلاغاتي</h1>
            <p className="text-muted-foreground">تابع حالة طلبات الصيانة الخاصة بوحدتك</p>
          </div>
          
          <button 
            onClick={() => setShowForm(!showForm)}
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-md font-medium shadow hover:bg-primary/90 transition-colors"
          >
            <Plus className={`w-5 h-5 transition-transform ${showForm ? 'rotate-45' : ''}`} />
            <span className="hidden sm:inline">إرسال بلاغ جديد</span>
          </button>
        </div>

        {/* New Request Form (Collapsible) */}
        {showForm && (
          <div className="mb-8 bg-card border rounded-xl shadow-sm p-6 animate-in slide-in-from-top-4 fade-in duration-300">
            <h2 className="text-lg font-bold mb-4">تفاصيل المشكلة</h2>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <label className="text-sm font-medium">نوع المشكلة</label>
                  <select 
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full border rounded-md px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                  >
                    <option value="كهرباء">كهرباء</option>
                    <option value="سباكة">سباكة</option>
                    <option value="تكييف">تكييف</option>
                    <option value="أخرى">أخرى</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">الأولوية</label>
                  <select 
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                    className="w-full border rounded-md px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                  >
                    <option value="عادي">عادي</option>
                    <option value="عاجل">عاجل</option>
                  </select>
                </div>
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium">وصف المشكلة</label>
                <textarea 
                  required
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="صف المشكلة باختصار لمساعدة الفني..."
                  className="w-full border rounded-md px-3 py-2 bg-background min-h-[100px] resize-y focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button 
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 border rounded-md font-medium text-muted-foreground hover:bg-muted transition-colors"
                >
                  إلغاء
                </button>
                <button 
                  type="submit"
                  className="px-6 py-2 bg-primary text-primary-foreground rounded-md font-medium shadow hover:bg-primary/90 transition-colors"
                >
                  إرسال البلاغ
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Requests List */}
        <div className="space-y-4">
          {requests.length > 0 ? (
            requests.map((req) => (
              <div key={req.id} className={`bg-card rounded-xl border p-5 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden`}>
                <div className={`absolute top-0 right-0 bottom-0 w-1 ${
                  req.status === 'معلّقة' ? 'bg-amber-500' :
                  req.status === 'قيد التنفيذ' ? 'bg-blue-500' : 'bg-green-500'
                }`} />
                
                <div className="flex flex-col sm:flex-row gap-4 justify-between sm:items-center">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                        {req.id}
                      </span>
                      <span className="font-medium">{req.category}</span>
                      {req.priority === 'عاجل' && (
                        <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-bold">
                          عاجل
                        </span>
                      )}
                    </div>
                    <p className="text-foreground text-sm font-medium mt-1">{req.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {req.date} • {req.technicianName ? `الفني: ${req.technicianName}` : 'بانتظار التكليف'}
                    </p>
                  </div>
                  
                  <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-medium shrink-0 ${getStatusColor(req.status)}`}>
                    {getStatusIcon(req.status)}
                    <span>{req.status}</span>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-16 bg-card border rounded-xl border-dashed">
              <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium mb-1">لا توجد بلاغات</h3>
              <p className="text-muted-foreground text-sm">كل شيء يعمل بشكل جيد في وحدتك.</p>
            </div>
          )}
        </div>

      </main>
    </div>
  );
}
