import { useState, useEffect } from "react";
import {
  Zap, Shield, Clock, Phone, Users, Star, CheckCircle, Check,
  Download, MessageCircle, ChevronDown, Smartphone, BarChart3,
  ArrowDown, Sparkles, BadgeCheck, HeadphonesIcon, RefreshCw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { getPackages, getAppConfig, type AppPackage, type AppConfig } from "@/lib/marketing";

const Landing = () => {
  const [packages, setPackages] = useState<AppPackage[]>([]);
  const [config, setConfig] = useState<AppConfig | null>(null);

  useEffect(() => {
    setPackages(getPackages().filter(p => p.enabled));
    setConfig(getAppConfig());
  }, []);

  if (!config) return null;

  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleContact = (pkg?: AppPackage) => {
    if (!config.whatsappContact) return;
    const phone = config.whatsappContact.replace(/^0/, '963');
    const msg = pkg
      ? `مرحباً، أريد الاشتراك بباقة "${pkg.name}" (${pkg.price.toLocaleString()} ${pkg.currency}/${pkg.durationLabel})`
      : 'مرحباً، أريد الاستفسار عن تطبيق تحويل الرصيد';
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  const trialPkg = packages.find(p => p.duration === 'trial');
  const paidPackages = packages.filter(p => p.duration !== 'trial');

  return (
    <div className="min-h-screen bg-background overflow-x-hidden" dir="rtl">

      {/* ── Hero ── */}
      <section className="relative min-h-[85vh] flex items-center justify-center">
        {/* layered bg */}
        <div className="absolute inset-0 bg-gradient-to-b from-primary via-primary/95 to-primary/80" />
        <div className="absolute inset-0">
          <div className="absolute top-0 left-0 w-full h-full opacity-[0.04]"
            style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, hsl(var(--primary-foreground)) 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent" />

        <div className="relative max-w-md mx-auto px-6 text-center z-10">
          {/* App icon */}
          <div className="w-20 h-20 mx-auto mb-6 rounded-[22px] bg-primary-foreground/15 backdrop-blur-md border border-primary-foreground/20 flex items-center justify-center shadow-2xl">
            <Smartphone className="w-10 h-10 text-primary-foreground" />
          </div>

          <h1 className="text-[2rem] leading-[1.2] font-black text-primary-foreground mb-4 tracking-tight">
            {config.heroTitle}
          </h1>
          <p className="text-base text-primary-foreground/75 leading-relaxed mb-8 max-w-xs mx-auto">
            {config.heroSubtitle}
          </p>

          {/* CTA */}
          <div className="flex flex-col gap-3 items-center">
            <Button
              size="lg"
              className="bg-primary-foreground text-primary hover:bg-primary-foreground/90 font-bold rounded-2xl h-14 px-8 text-[15px] shadow-xl w-full max-w-[280px]"
              onClick={() => scrollToSection('pricing')}
            >
              <Sparkles className="w-5 h-5 ml-2" />
              جرّب مجاناً لمدة 30 يوم
            </Button>

            {config.downloadUrl && (
              <Button
                size="lg"
                variant="ghost"
                className="text-primary-foreground/80 hover:text-primary-foreground hover:bg-primary-foreground/10 font-semibold rounded-2xl h-12 px-6 text-sm"
                onClick={() => window.open(config.downloadUrl, '_blank')}
              >
                <Download className="w-4 h-4 ml-2" />
                تحميل التطبيق مباشرة
              </Button>
            )}
          </div>

          {/* Trust indicators */}
          <div className="mt-10 flex items-center justify-center gap-6 text-primary-foreground/50 text-[11px]">
            <span className="flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5" />
              آمن 100%
            </span>
            <span className="flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5" />
              بدون انترنت
            </span>
            <span className="flex items-center gap-1.5">
              <BadgeCheck className="w-3.5 h-3.5" />
              موثوق
            </span>
          </div>

          {/* Scroll hint */}
          <button
            onClick={() => scrollToSection('features')}
            className="mt-8 mx-auto block animate-bounce text-primary-foreground/40 hover:text-primary-foreground/60 transition-colors"
          >
            <ArrowDown className="w-5 h-5" />
          </button>
        </div>
      </section>

      {/* ── Stats strip ── */}
      <section className="relative -mt-6 z-20 max-w-md mx-auto px-5">
        <div className="bg-card rounded-2xl border border-border shadow-lg p-5 grid grid-cols-3 gap-4 text-center">
          {[
            { value: '+500', label: 'مستخدم نشط' },
            { value: '24/7', label: 'دعم فني' },
            { value: '99%', label: 'نسبة الرضا' },
          ].map((s, i) => (
            <div key={i}>
              <p className="text-xl font-black text-primary">{s.value}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="max-w-md mx-auto px-5 py-14">
        <div className="text-center mb-10">
          <span className="inline-block text-[11px] font-bold text-primary bg-primary/10 rounded-full px-3 py-1 mb-3">المميزات</span>
          <h2 className="text-xl font-bold text-foreground">كل ما تحتاجه في تطبيق واحد</h2>
        </div>

        <div className="space-y-3">
          {[
            { icon: Zap, title: 'تحويل فوري بلمسة واحدة', desc: 'نفّذ أكواد USSD مباشرة بدون كتابة يدوية أو أخطاء', color: 'text-amber-500 bg-amber-500/10' },
            { icon: Shield, title: 'خصوصية وأمان كامل', desc: 'بياناتك تبقى على جهازك فقط — لا سيرفرات أو مشاركة', color: 'text-emerald-500 bg-emerald-500/10' },
            { icon: Smartphone, title: 'دعم سيريتل و MTN', desc: 'شريحتين معاً مع كشف تلقائي للمشغل', color: 'text-blue-500 bg-blue-500/10' },
            { icon: Users, title: 'إدارة حساب الموزع', desc: 'تتبع رصيدك ومبيعاتك مع الموزع بسهولة', color: 'text-violet-500 bg-violet-500/10' },
            { icon: BarChart3, title: 'تقارير وإحصائيات ذكية', desc: 'تحليل يومي وشهري لعملياتك مع رسوم بيانية', color: 'text-cyan-500 bg-cyan-500/10' },
            { icon: Clock, title: 'يعمل بدون انترنت', desc: 'لا حاجة لاتصال بالإنترنت — يعمل في أي وقت ومكان', color: 'text-orange-500 bg-orange-500/10' },
          ].map((f, i) => (
            <div key={i} className="flex items-start gap-4 bg-card border border-border rounded-2xl p-4 shadow-sm">
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${f.color}`}>
                <f.icon className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-foreground mb-0.5">{f.title}</h3>
                <p className="text-[12px] text-muted-foreground leading-relaxed">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="pricing" className="py-14 bg-muted/40">
        <div className="max-w-md mx-auto px-5">
          <div className="text-center mb-10">
            <span className="inline-block text-[11px] font-bold text-primary bg-primary/10 rounded-full px-3 py-1 mb-3">الأسعار</span>
            <h2 className="text-xl font-bold text-foreground mb-2">باقات بأسعار مناسبة</h2>
            <p className="text-sm text-muted-foreground">اختر الباقة المناسبة لعملك</p>
          </div>

          {/* Free trial banner */}
          {trialPkg && (
            <div className="mb-6 bg-primary/5 border-2 border-dashed border-primary/30 rounded-2xl p-5 text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Sparkles className="w-5 h-5 text-primary" />
                <h3 className="text-base font-bold text-foreground">جرّب مجاناً لمدة 30 يوم</h3>
              </div>
              <p className="text-xs text-muted-foreground mb-4">
                جميع الميزات متاحة خلال الفترة التجريبية — بدون أي التزام
              </p>
              <Button
                className="font-bold rounded-xl h-11 px-8"
                onClick={() => {
                  if (config.downloadUrl) {
                    window.open(config.downloadUrl, '_blank');
                  } else {
                    handleContact(trialPkg);
                  }
                }}
              >
                <Download className="w-4 h-4 ml-2" />
                حمّل وابدأ التجربة
              </Button>
            </div>
          )}

          {/* Paid packages */}
          <div className="space-y-4">
            {paidPackages.map((pkg) => (
              <div
                key={pkg.id}
                className={`relative bg-card rounded-2xl overflow-hidden transition-all ${
                  pkg.popular
                    ? 'border-2 border-primary shadow-lg'
                    : 'border border-border shadow-sm'
                }`}
              >
                {pkg.popular && (
                  <div className="bg-primary text-primary-foreground text-[11px] font-bold text-center py-1.5 flex items-center justify-center gap-1.5">
                    <Star className="w-3.5 h-3.5 fill-current" />
                    الأكثر طلباً — وفّر أكثر
                  </div>
                )}

                <div className="p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-bold text-foreground">{pkg.name}</h3>
                      <p className="text-xs text-muted-foreground">{pkg.durationLabel}</p>
                    </div>
                    <div className="text-left">
                      <span className="text-2xl font-black text-foreground">{pkg.price.toLocaleString()}</span>
                      <span className="text-[11px] text-muted-foreground mr-1">{pkg.currency}</span>
                    </div>
                  </div>

                  <div className="space-y-2 mb-5">
                    {pkg.features.map((f, i) => (
                      <div key={i} className="flex items-center gap-2.5">
                        <div className="w-4 h-4 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <Check className="w-2.5 h-2.5 text-primary" />
                        </div>
                        <span className="text-[13px] text-foreground">{f}</span>
                      </div>
                    ))}
                  </div>

                  <Button
                    className={`w-full h-12 font-bold rounded-xl text-sm ${
                      pkg.popular ? '' : 'bg-primary/10 text-primary hover:bg-primary/20'
                    }`}
                    variant={pkg.popular ? 'default' : 'ghost'}
                    onClick={() => handleContact(pkg)}
                  >
                    <MessageCircle className="w-4 h-4 ml-2" />
                    اطلب عبر واتساب
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Trust / Why us ── */}
      <section className="max-w-md mx-auto px-5 py-14">
        <div className="text-center mb-8">
          <span className="inline-block text-[11px] font-bold text-primary bg-primary/10 rounded-full px-3 py-1 mb-3">لماذا نحن؟</span>
          <h2 className="text-xl font-bold text-foreground">آلاف المستخدمين يثقون بنا</h2>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {[
            { icon: HeadphonesIcon, title: 'دعم فني سريع', desc: 'فريق متاح عبر واتساب' },
            { icon: RefreshCw, title: 'تحديثات مستمرة', desc: 'ميزات جديدة كل شهر' },
            { icon: Shield, title: 'ضمان الجودة', desc: 'استرداد خلال 7 أيام' },
            { icon: Zap, title: 'أداء عالي', desc: 'سرعة وثبات مضمون' },
          ].map((item, i) => (
            <div key={i} className="bg-card border border-border rounded-2xl p-4 text-center shadow-sm">
              <div className="w-10 h-10 mx-auto mb-2 rounded-xl bg-primary/8 flex items-center justify-center">
                <item.icon className="w-5 h-5 text-primary" />
              </div>
              <h3 className="text-[13px] font-bold text-foreground mb-0.5">{item.title}</h3>
              <p className="text-[11px] text-muted-foreground">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Download ── */}
      {config.downloadUrl && (
        <section className="max-w-md mx-auto px-5 pb-14">
          <div className="bg-card border border-border rounded-2xl p-6 text-center shadow-sm">
            <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Download className="w-7 h-7 text-primary" />
            </div>
            <h2 className="text-lg font-bold text-foreground mb-1">حمّل التطبيق الآن</h2>
            <p className="text-xs text-muted-foreground mb-1">الإصدار {config.appVersion}</p>
            {config.changelog && (
              <p className="text-[11px] text-muted-foreground mb-4 bg-muted rounded-xl px-3 py-2 inline-block">{config.changelog}</p>
            )}
            <div>
              <Button
                size="lg"
                className="font-bold rounded-xl h-12 px-8"
                onClick={() => window.open(config.downloadUrl, '_blank')}
              >
                <Download className="w-5 h-5 ml-2" />
                تحميل APK
              </Button>
            </div>
          </div>
        </section>
      )}

      {/* ── Contact ── */}
      {config.whatsappContact && (
        <section className="bg-primary/5 border-t border-border py-10">
          <div className="max-w-md mx-auto px-5 text-center">
            <h3 className="text-base font-bold text-foreground mb-2">عندك سؤال؟</h3>
            <p className="text-sm text-muted-foreground mb-4">فريقنا جاهز لمساعدتك</p>
            <Button
              variant="outline"
              className="font-bold rounded-xl h-12 px-6 border-primary/30 text-primary hover:bg-primary hover:text-primary-foreground transition-colors"
              onClick={() => handleContact()}
            >
              <MessageCircle className="w-4 h-4 ml-2" />
              تواصل عبر واتساب
            </Button>
          </div>
        </section>
      )}

      {/* ── Footer ── */}
      <footer className="py-6 text-center border-t border-border">
        <p className="text-[11px] text-muted-foreground">
          تطبيق تحويل الرصيد © {new Date().getFullYear()} — جميع الحقوق محفوظة
        </p>
      </footer>
    </div>
  );
};

export default Landing;
