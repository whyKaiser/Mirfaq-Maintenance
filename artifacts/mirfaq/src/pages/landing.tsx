import React, { useState, useEffect } from 'react';
import { Link } from 'wouter';
import { Building2, Home, Wrench, Menu, X, CheckCircle2, Clock, BarChart3, Users, WrenchIcon, ArrowLeft, ArrowUpRight } from 'lucide-react';

export default function LandingPage() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden font-sans">
      {/* Navigation */}
      <header 
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 border-b ${
          isScrolled 
            ? 'bg-background/80 backdrop-blur-md border-border shadow-sm py-3' 
            : 'bg-transparent border-transparent py-5'
        }`}
      >
        <div className="container mx-auto px-4 md:px-6">
          <div className="flex items-center justify-between">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2 group">
              <div className="w-10 h-10 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-bold text-xl transition-transform group-hover:scale-105">
                م
              </div>
              <span className="text-2xl font-bold tracking-tight">مِرفق</span>
            </Link>

            {/* Desktop Nav */}
            <nav className="hidden md:flex items-center gap-8 text-sm font-medium">
              <a href="#features" className="text-muted-foreground hover:text-foreground transition-colors">الميزات</a>
              <a href="#how-it-works" className="text-muted-foreground hover:text-foreground transition-colors">كيف يعمل</a>
              <a href="#stats" className="text-muted-foreground hover:text-foreground transition-colors">الإحصائيات</a>
              <a href="#contact" className="text-muted-foreground hover:text-foreground transition-colors">تواصل معنا</a>
            </nav>

            {/* CTA */}
            <div className="hidden md:flex items-center gap-4">
              <Link 
                href="/login" 
                className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
                data-testid="link-nav-login"
              >
                ابدأ الآن
              </Link>
            </div>

            {/* Mobile Menu Toggle */}
            <button 
              className="md:hidden text-foreground p-2"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              data-testid="btn-mobile-menu"
            >
              {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 top-[60px] z-40 bg-background/95 backdrop-blur-sm border-b md:hidden flex flex-col pt-4 pb-8 px-4 animate-in slide-in-from-top-4">
          <nav className="flex flex-col gap-4 text-lg font-medium p-4 rounded-xl bg-card border shadow-sm">
            <a href="#features" onClick={() => setIsMobileMenuOpen(false)} className="py-2 border-b">الميزات</a>
            <a href="#how-it-works" onClick={() => setIsMobileMenuOpen(false)} className="py-2 border-b">كيف يعمل</a>
            <a href="#stats" onClick={() => setIsMobileMenuOpen(false)} className="py-2 border-b">الإحصائيات</a>
            <a href="#contact" onClick={() => setIsMobileMenuOpen(false)} className="py-2">تواصل معنا</a>
            <Link 
              href="/login" 
              className="mt-4 inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-3 text-sm font-medium text-primary-foreground shadow"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              ابدأ الآن
            </Link>
          </nav>
        </div>
      )}

      <main>
        {/* Hero Section */}
        <section className="relative pt-32 pb-20 md:pt-48 md:pb-32 overflow-hidden">
          {/* Background Decorative Elements */}
          <div className="absolute top-0 inset-x-0 h-[500px] bg-gradient-to-b from-teal-50/50 to-transparent -z-10 dark:from-teal-950/20" />
          <div className="absolute top-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-primary/5 blur-[120px] -z-10" />
          <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-accent/5 blur-[100px] -z-10" />
          
          <div className="container mx-auto px-4 md:px-6">
            <div className="flex flex-col items-center text-center max-w-4xl mx-auto space-y-8">
              <div className="inline-flex items-center rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-sm text-primary">
                <span className="flex h-2 w-2 rounded-full bg-primary me-2 animate-pulse"></span>
                المنصة الأولى لإدارة العقارات في المملكة
              </div>
              
              <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.15]">
                صيانة عقارك، <br className="hidden md:block" />
                <span className="text-transparent bg-clip-text bg-gradient-to-l from-primary to-teal-500">
                  بوضوح وسهولة
                </span>
              </h1>
              
              <p className="text-lg md:text-xl text-muted-foreground max-w-2xl leading-relaxed">
                منصة متكاملة لإدارة بلاغات الصيانة للمجمعات السكنية والتجارية. 
                اربط الساكن، والفني، والإدارة في مكان واحد.
              </p>
              
              <div className="flex flex-col sm:flex-row items-center gap-4 pt-4 w-full sm:w-auto">
                <Link 
                  href="/login" 
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-8 py-4 text-base font-medium text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 hover:-translate-y-1"
                  data-testid="link-hero-start"
                >
                  جرّب مجاناً
                  <ArrowLeft className="w-5 h-5 rtl:-scale-x-100" />
                </Link>
                <button 
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-lg border-2 border-input bg-transparent px-8 py-4 text-base font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground hover:border-accent"
                  data-testid="btn-demo"
                >
                  شاهد العرض التوضيحي
                </button>
              </div>
            </div>

            {/* Dashboard Mockup */}
            <div className="mt-20 mx-auto max-w-5xl relative">
              <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent z-10 top-1/2 pointer-events-none" />
              <div className="rounded-xl border bg-card text-card-foreground shadow-2xl shadow-primary/5 overflow-hidden transform transition-transform hover:scale-[1.01] duration-500">
                <div className="border-b bg-muted/30 px-4 py-3 flex items-center gap-2">
                  <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-red-400" />
                    <div className="w-3 h-3 rounded-full bg-amber-400" />
                    <div className="w-3 h-3 rounded-full bg-green-400" />
                  </div>
                  <div className="mx-auto bg-background border rounded px-3 py-1 text-xs text-muted-foreground flex items-center gap-2 w-64 justify-center">
                    <span>mirfaq.sa/dashboard</span>
                  </div>
                </div>
                <div className="p-6 md:p-8 grid grid-cols-1 md:grid-cols-4 gap-6">
                  {/* Sidebar mockup */}
                  <div className="hidden md:flex flex-col gap-4 border-l pl-6">
                    <div className="h-8 w-24 bg-primary/10 rounded-md mb-4" />
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div key={i} className={`h-8 rounded-md ${i === 1 ? 'bg-primary/10' : 'bg-muted/50'}`} />
                    ))}
                  </div>
                  {/* Content mockup */}
                  <div className="md:col-span-3 flex flex-col gap-6">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {[
                        { title: 'البلاغات', val: '24', c: 'bg-primary/10 text-primary' },
                        { title: 'معلّقة', val: '7', c: 'bg-amber-100 text-amber-700' },
                        { title: 'قيد التنفيذ', val: '11', c: 'bg-blue-100 text-blue-700' },
                        { title: 'مكتملة', val: '6', c: 'bg-green-100 text-green-700' }
                      ].map((stat, i) => (
                        <div key={i} className="p-4 rounded-xl border bg-card flex flex-col gap-2">
                          <span className="text-sm text-muted-foreground">{stat.title}</span>
                          <span className="text-2xl font-bold">{stat.val}</span>
                          <div className={`h-1.5 w-full rounded-full ${stat.c.split(' ')[0]}`} />
                        </div>
                      ))}
                    </div>
                    <div className="border rounded-xl overflow-hidden flex flex-col">
                      <div className="bg-muted/30 p-4 border-b flex justify-between items-center">
                        <div className="h-5 w-32 bg-muted rounded" />
                        <div className="h-8 w-24 bg-primary/10 rounded-md" />
                      </div>
                      <div className="p-4 flex flex-col gap-4">
                        {[1, 2, 3].map((row) => (
                          <div key={row} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/20 transition-colors">
                            <div className="flex items-center gap-4">
                              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                                <Wrench className="w-5 h-5 text-muted-foreground" />
                              </div>
                              <div className="flex flex-col gap-2">
                                <div className="h-4 w-32 bg-muted rounded" />
                                <div className="h-3 w-20 bg-muted/60 rounded" />
                              </div>
                            </div>
                            <div className={`px-3 py-1 rounded-full text-xs font-medium ${
                              row === 1 ? 'bg-amber-100 text-amber-700' : 
                              row === 2 ? 'bg-blue-100 text-blue-700' : 
                              'bg-green-100 text-green-700'
                            }`}>
                              {row === 1 ? 'معلّقة' : row === 2 ? 'قيد التنفيذ' : 'مكتملة'}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Benefits Section */}
        <section className="py-20 bg-muted/30" id="benefits">
          <div className="container mx-auto px-4 md:px-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {[
                { 
                  icon: <Home className="w-8 h-8 text-primary" />, 
                  title: 'استقبال بلاغات الصيانة', 
                  desc: 'تلقى بلاغات السكان فوراً مع تفاصيل دقيقة وصور للمشكلة.' 
                },
                { 
                  icon: <Users className="w-8 h-8 text-amber-500" />, 
                  title: 'متابعة الفنيين', 
                  desc: 'كلف الفني المناسب وتابع تقدم العمل خطوة بخطوة في الوقت الفعلي.' 
                },
                { 
                  icon: <Clock className="w-8 h-8 text-green-500" />, 
                  title: 'قياس سرعة الإنجاز', 
                  desc: 'حلل أداء فريق الصيانة وحسن من جودة الخدمة المقدمة للمستأجرين.' 
                }
              ].map((benefit, i) => (
                <div key={i} className="flex flex-col items-start p-8 rounded-2xl bg-card border shadow-sm hover:shadow-md transition-shadow">
                  <div className="p-3 bg-muted rounded-xl mb-6">
                    {benefit.icon}
                  </div>
                  <h3 className="text-xl font-bold mb-3">{benefit.title}</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    {benefit.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="py-24" id="features">
          <div className="container mx-auto px-4 md:px-6">
            <div className="text-center max-w-2xl mx-auto mb-16 space-y-4">
              <h2 className="text-3xl md:text-4xl font-bold">كل ما تحتاجه لإدارة الصيانة</h2>
              <p className="text-lg text-muted-foreground">أدوات متكاملة مصممة خصيصاً لمدراء العقارات في السوق السعودي.</p>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
              {[
                { title: 'لوحة تحكم موحدة', icon: <BarChart3 className="w-6 h-6" /> },
                { title: 'إشعارات فورية', icon: <CheckCircle2 className="w-6 h-6" /> },
                { title: 'تقارير مفصلة', icon: <BarChart3 className="w-6 h-6" /> },
                { title: 'إدارة الفنيين', icon: <WrenchIcon className="w-6 h-6" /> },
                { title: 'تتبع الحالة', icon: <Clock className="w-6 h-6" /> },
                { title: 'تاريخ البلاغات', icon: <Building2 className="w-6 h-6" /> }
              ].map((feature, i) => (
                <div key={i} className="flex items-center gap-4 p-6 rounded-xl border bg-card hover:border-primary/50 transition-colors cursor-default">
                  <div className="p-2.5 rounded-lg bg-primary/10 text-primary">
                    {feature.icon}
                  </div>
                  <h3 className="font-semibold text-lg">{feature.title}</h3>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="py-24 bg-sidebar text-sidebar-foreground" id="how-it-works">
          <div className="container mx-auto px-4 md:px-6">
            <div className="text-center max-w-2xl mx-auto mb-16 space-y-4">
              <h2 className="text-3xl md:text-4xl font-bold">رحلة البلاغ ببساطة</h2>
              <p className="text-sidebar-foreground/70 text-lg">من الإرسال حتى الإنجاز، عملية واضحة للجميع.</p>
            </div>

            <div className="relative">
              {/* Connecting line (desktop only) */}
              <div className="hidden md:block absolute top-12 left-24 right-24 h-0.5 bg-sidebar-border" />
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-12 relative z-10">
                {[
                  { step: '1', title: 'يُرسل الساكن بلاغاً', desc: 'يحدد المشكلة، الوحدة، ويرفق صوراً من هاتفه بثوانٍ.' },
                  { step: '2', title: 'يُكلَّف الفني المناسب', desc: 'يقوم مدير العقار بتوجيه البلاغ لفني متاح حسب الاختصاص.' },
                  { step: '3', title: 'تُتابَع حتى الإنجاز', desc: 'يُنهي الفني المهمة ويتلقى الساكن إشعاراً بالحل.' }
                ].map((step, i) => (
                  <div key={i} className="flex flex-col items-center text-center">
                    <div className="w-24 h-24 rounded-full bg-sidebar border-[8px] border-background flex items-center justify-center text-3xl font-bold text-primary shadow-xl mb-6 relative">
                      {step.step}
                    </div>
                    <h3 className="text-xl font-bold mb-3">{step.title}</h3>
                    <p className="text-sidebar-foreground/70">{step.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Stats */}
        <section className="py-24" id="stats">
          <div className="container mx-auto px-4 md:px-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
              {[
                { val: '+1200', label: 'وحدة سكنية تدار' },
                { val: '98%', label: 'رضا المستخدمين' },
                { val: '-40%', label: 'وقت الاستجابة' },
                { val: '+500', label: 'فني مسجل' }
              ].map((stat, i) => (
                <div key={i} className="text-center space-y-2">
                  <h4 className="text-4xl md:text-5xl font-bold text-primary">{stat.val}</h4>
                  <p className="text-muted-foreground font-medium">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-24 relative overflow-hidden bg-primary text-primary-foreground">
          <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white via-transparent to-transparent" />
          <div className="container mx-auto px-4 md:px-6 relative z-10 text-center">
            <h2 className="text-3xl md:text-5xl font-bold mb-6">ابدأ إدارة عقاراتك اليوم</h2>
            <p className="text-primary-foreground/80 text-lg mb-10 max-w-2xl mx-auto">
              انضم إلى عشرات مدراء العقارات الذين يثقون بمنصة مِرفق لتبسيط عمليات الصيانة ورفع مستوى رضا المستأجرين.
            </p>
            <Link 
              href="/login" 
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-background px-8 py-4 text-base font-bold text-primary shadow-lg transition-transform hover:-translate-y-1"
            >
              ابدأ تجربتك المجانية
            </Link>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-card border-t py-12">
        <div className="container mx-auto px-4 md:px-6 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md bg-primary text-primary-foreground flex items-center justify-center font-bold">
              م
            </div>
            <span className="text-xl font-bold">مِرفق</span>
          </div>
          <div className="flex gap-6 text-sm text-muted-foreground">
            <a href="#" className="hover:text-foreground">الشروط والأحكام</a>
            <a href="#" className="hover:text-foreground">سياسة الخصوصية</a>
            <a href="#" className="hover:text-foreground">الدعم الفني</a>
          </div>
          <p className="text-sm text-muted-foreground">
            جميع الحقوق محفوظة © {new Date().getFullYear()} مِرفق
          </p>
        </div>
      </footer>
    </div>
  );
}
