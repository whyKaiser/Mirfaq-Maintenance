import { Link, useLocation } from 'wouter';
import { Building2, Home, Wrench, ArrowRight } from 'lucide-react';
import { useState } from 'react';

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const [selectedRole, setSelectedRole] = useState<string | null>(null);

  const roles = [
    {
      id: 'manager',
      title: 'مدير العقار',
      icon: Building2,
      desc: 'إدارة العقارات والمستأجرين والفنيين',
      path: '/manager'
    },
    {
      id: 'resident',
      title: 'الساكن',
      icon: Home,
      desc: 'إرسال بلاغات ومتابعة طلباتك',
      path: '/resident'
    },
    {
      id: 'technician',
      title: 'الفني',
      icon: Wrench,
      desc: 'استقبال مهام الصيانة وإتمامها',
      path: '/technician'
    }
  ];

  const handleSelect = (path: string, id: string) => {
    setSelectedRole(id);
    // Add a slight delay for demo visual effect
    setTimeout(() => {
      setLocation(path);
    }, 400);
  };

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col items-center justify-center p-4 font-sans">
      
      <Link href="/" className="absolute top-8 right-8 flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors group">
        <ArrowRight className="w-4 h-4 rtl:-scale-x-100 group-hover:translate-x-1 transition-transform" />
        <span className="text-sm font-medium">العودة للرئيسية</span>
      </Link>

      <div className="w-full max-w-4xl animate-in fade-in slide-in-from-bottom-8 duration-500">
        
        <div className="text-center mb-12 space-y-4">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary text-primary-foreground font-bold text-3xl mb-4 shadow-lg shadow-primary/20">
            م
          </div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground">
            اختر دورك للدخول التجريبي
          </h1>
          <p className="text-muted-foreground text-lg">
            هذه واجهة تجريبية. لا حاجة لإدخال كلمة مرور.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {roles.map((role) => {
            const Icon = role.icon;
            const isSelected = selectedRole === role.id;
            
            return (
              <button
                key={role.id}
                onClick={() => handleSelect(role.path, role.id)}
                className={`
                  relative group text-right flex flex-col p-8 rounded-2xl border-2 transition-all duration-300
                  ${isSelected 
                    ? 'border-primary bg-primary/5 scale-[1.02] shadow-xl shadow-primary/10' 
                    : 'border-border bg-card hover:border-primary/50 hover:shadow-lg hover:-translate-y-1'
                  }
                `}
                data-testid={`btn-role-${role.id}`}
              >
                {isSelected && (
                  <span className="absolute top-4 left-4 flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-primary"></span>
                  </span>
                )}
                
                <div className={`
                  p-4 rounded-xl w-fit mb-6 transition-colors
                  ${isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary'}
                `}>
                  <Icon className="w-8 h-8" />
                </div>
                
                <h3 className="text-xl font-bold mb-2">{role.title}</h3>
                <p className="text-muted-foreground leading-relaxed">
                  {role.desc}
                </p>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  );
}
