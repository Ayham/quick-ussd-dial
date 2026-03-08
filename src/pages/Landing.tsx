import { useState, useEffect } from "react";
import {
  Zap, Shield, Clock, Users, Star, Check,
  Download, MessageCircle, Smartphone, BarChart3,
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
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  const handleContact = (pkg?: AppPackage) => {
    if (!config.whatsappContact) return;
    const phone = config.whatsappContact.replace(/^0/, "963");
    const msg = pkg
      ? `مرحباً، أريد الاشتراك بباقة "${pkg.name}" (${pkg.price.toLocaleString()} ${pkg.currency}/${pkg.durationLabel})`
      : "مرحباً، أريد الاستفسار عن تطبيق تحويل الرصيد";
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, "_blank");
  };

  const trialPkg = packages.find(p => p.duration === "trial");
  const paidPackages = packages.filter(p => p.duration !== "trial");

  return (
    <div className="min-h-screen bg-background overflow-x-hidden" dir="rtl">

      {/* ── Hero ── */}
      <section className="relative min-h-[80vh] md:min-h-[70vh] lg:min-h-[80vh] flex items-center justify-center">
        <div className="absolute inset-0 bg-gradient-to-b from-primary via-primary/95 to-primary/80" />
        <div className="absolute inset-0 opacity-[0.04]"
          style={{ backgroundImage: "radial-gradient(circle at 20% 50%, hsl(var(--primary-foreground)) 1px, transparent 1px)", backgroundSize: "32px 32px" }}
        />
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent" />

        <div className="relative w-full max-w-3xl mx-auto px-5 sm:px-8 text-center z-10 py-16 md:py-20">
          {/* App icon */}
          <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-5 sm:mb-6 rounded-[18px] sm:rounded-[22px] bg-primary-foreground/15 backdrop-blur-md border border-primary-foreground/20 flex items-center justify-center shadow-2xl">
            <Smartphone className="w-8 h-8 sm:w-10 sm:h-10 text-primary-foreground" />
          </div>

          <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl leading-tight font-black text-primary-foreground mb-3 sm:mb-4 tracking-tight">
            {config.heroTitle}
          </h1>
          <p className="text-sm sm:text-base md:text-lg text-primary-foreground/75 leading-relaxed mb-6 sm:mb-8 max-w-md md:max-w-lg mx-auto">
            {config.heroSubtitle}
          </p>

          {/* CTA */}
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-center">
            <Button
              size="lg"
              className="bg-primary-foreground text-primary hover:bg-primary-foreground/90 font-bold rounded-2xl h-12 sm:h-14 px-6 sm:px-8 text-sm sm:text-[15px] shadow-xl w-full sm:w-auto max-w-[300px]"
              onClick={() => scrollToSection("pricing")}
            >
              <Sparkles className="w-5 h-5 ml-2" />
              جرّب مجاناً لمدة 30 يوم
            </Button>

            {config.downloadUrl && (
              <Button
                size="lg"
                variant="ghost"
                className="text-primary-foreground/80 hover:text-primary-foreground hover:bg-primary-foreground/10 font-semibold rounded-2xl h-11 sm:h-12 px-5 sm:px-6 text-sm"
                onClick={() => window.open(config.downloadUrl, "_blank")}
              >
                <Download className="w-4 h-4 ml-2" />
                تحميل التطبيق مباشرة
              </Button>
            )}
          </div>

          {/* Trust indicators */}
          <div className="mt-8 sm:mt-10 flex items-center justify-center gap-4 sm:gap-6 text-primary-foreground/50 text-[10px] sm:text-[11px]">
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

          <button
            onClick={() => scrollToSection("features")}
            className="mt-6 sm:mt-8 mx-auto block animate-bounce text-primary-foreground/40 hover:text-primary-foreground/60 transition-colors"
          >
            <ArrowDown className="w-5 h-5" />
          </button>
        </div>
      </section>

      {/* ── Stats strip ── */}
      <section className="relative -mt-6 z-20 w-full max-w-3xl mx-auto px-5 sm:px-8">
        <div className="bg-card rounded-2xl border border-border shadow-lg p-4 sm:p-6 grid grid-cols-3 gap-3 sm:gap-6 text-center">
          {[
            { value: "30 يوم", label: "تجربة مجانية" },
            { value: "24/7", label: "دعم فني" },
            { value: "100%", label: "أوفلاين" },
          ].map((s, i) => (
            <div key={i}>
              <p className="text-lg sm:text-2xl md:text-3xl font-black text-primary">{s.value}</p>
              <p className="text-[9px] sm:text-[11px] md:text-xs text-muted-foreground mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="w-full max-w-4xl mx-auto px-5 sm:px-8 py-12 sm:py-16 lg:py-20">
        <div className="text-center mb-8 sm:mb-10">
          <span className="inline-block text-[11px] font-bold text-primary bg-primary/10 rounded-full px-3 py-1 mb-3">المميزات</span>
          <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-foreground">كل ما تحتاجه في تطبيق واحد</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {[
            { icon: Zap, title: "تحويل فوري بلمسة واحدة", desc: "نفّذ أكواد USSD مباشرة بدون كتابة يدوية أو أخطاء", color: "text-amber-500 bg-amber-500/10" },
            { icon: Shield, title: "خصوصية وأمان كامل", desc: "بياناتك تبقى على جهازك فقط — لا سيرفرات أو مشاركة", color: "text-emerald-500 bg-emerald-500/10" },
            { icon: Smartphone, title: "دعم سيريتل و MTN", desc: "شريحتين معاً مع كشف تلقائي للمشغل", color: "text-blue-500 bg-blue-500/10" },
            { icon: Users, title: "إدارة حساب الموزع", desc: "تتبع رصيدك ومبيعاتك مع الموزع بسهولة", color: "text-violet-500 bg-violet-500/10" },
            { icon: BarChart3, title: "تقارير وإحصائيات ذكية", desc: "تحليل يومي وشهري لعملياتك مع رسوم بيانية", color: "text-cyan-500 bg-cyan-500/10" },
            { icon: Clock, title: "يعمل بدون انترنت", desc: "لا حاجة لاتصال بالإنترنت — يعمل في أي وقت ومكان", color: "text-orange-500 bg-orange-500/10" },
          ].map((f, i) => (
            <div key={i} className="flex items-start gap-3 sm:gap-4 bg-card border border-border rounded-2xl p-4 sm:p-5 shadow-sm hover:shadow-md transition-shadow">
              <div className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center shrink-0 ${f.color}`}>
                <f.icon className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm sm:text-[15px] font-bold text-foreground mb-0.5">{f.title}</h3>
                <p className="text-[11px] sm:text-xs text-muted-foreground leading-relaxed">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="pricing" className="py-12 sm:py-16 lg:py-20 bg-muted/40">
        <div className="w-full max-w-4xl mx-auto px-5 sm:px-8">
          <div className="text-center mb-8 sm:mb-10">
            <span className="inline-block text-[11px] font-bold text-primary bg-primary/10 rounded-full px-3 py-1 mb-3">الأسعار</span>
            <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-foreground mb-2">باقات بأسعار مناسبة</h2>
            <p className="text-xs sm:text-sm text-muted-foreground">اختر الباقة المناسبة لعملك</p>
          </div>

          {/* Free trial banner */}
          {trialPkg && (
            <div className="mb-6 sm:mb-8 bg-primary/5 border-2 border-dashed border-primary/30 rounded-2xl p-5 sm:p-6 text-center max-w-lg mx-auto">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Sparkles className="w-5 h-5 text-primary" />
                <h3 className="text-base sm:text-lg font-bold text-foreground">جرّب مجاناً لمدة 30 يوم</h3>
              </div>
              <p className="text-xs sm:text-sm text-muted-foreground mb-4">
                جميع الميزات متاحة خلال الفترة التجريبية — بدون أي التزام
              </p>
              <Button
                className="font-bold rounded-xl h-11 px-8"
                onClick={() => {
                  if (config.downloadUrl) {
                    window.open(config.downloadUrl, "_blank");
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            {paidPackages.map((pkg) => (
              <div
                key={pkg.id}
                className={`relative bg-card rounded-2xl overflow-hidden transition-all flex flex-col ${
                  pkg.popular
                    ? "border-2 border-primary shadow-lg"
                    : "border border-border shadow-sm"
                }`}
              >
                {pkg.popular && (
                  <div className="bg-primary text-primary-foreground text-[11px] font-bold text-center py-1.5 flex items-center justify-center gap-1.5">
                    <Star className="w-3.5 h-3.5 fill-current" />
                    الأكثر طلباً — وفّر أكثر
                  </div>
                )}

                <div className="p-5 sm:p-6 flex flex-col flex-1">
                  <div className="mb-4">
                    <h3 className="text-lg font-bold text-foreground">{pkg.name}</h3>
                    <p className="text-xs text-muted-foreground">{pkg.durationLabel}</p>
                  </div>

                  <div className="mb-4">
                    <span className="text-2xl sm:text-3xl font-black text-foreground">{pkg.price.toLocaleString()}</span>
                    <span className="text-[11px] text-muted-foreground mr-1">{pkg.currency}</span>
                  </div>

                  <div className="space-y-2 mb-5 flex-1">
                    {pkg.features.map((f, i) => (
                      <div key={i} className="flex items-center gap-2.5">
                        <div className="w-4 h-4 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <Check className="w-2.5 h-2.5 text-primary" />
                        </div>
                        <span className="text-xs sm:text-[13px] text-foreground">{f}</span>
                      </div>
                    ))}
                  </div>

                  <Button
                    className={`w-full h-11 sm:h-12 font-bold rounded-xl text-sm ${
                      pkg.popular ? "" : "bg-primary/10 text-primary hover:bg-primary/20"
                    }`}
                    variant={pkg.popular ? "default" : "ghost"}
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
      <section className="w-full max-w-4xl mx-auto px-5 sm:px-8 py-12 sm:py-16 lg:py-20">
        <div className="text-center mb-8">
          <span className="inline-block text-[11px] font-bold text-primary bg-primary/10 rounded-full px-3 py-1 mb-3">لماذا نحن؟</span>
          <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-foreground">آلاف المستخدمين يثقون بنا</h2>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          {[
            { icon: HeadphonesIcon, title: "دعم فني سريع", desc: "فريق متاح عبر واتساب" },
            { icon: RefreshCw, title: "تحديثات مستمرة", desc: "ميزات جديدة كل شهر" },
            { icon: Shield, title: "ضمان الجودة", desc: "استرداد خلال 7 أيام" },
            { icon: Zap, title: "أداء عالي", desc: "سرعة وثبات مضمون" },
          ].map((item, i) => (
            <div key={i} className="bg-card border border-border rounded-2xl p-4 sm:p-5 text-center shadow-sm">
              <div className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-2 rounded-xl bg-primary/10 flex items-center justify-center">
                <item.icon className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
              </div>
              <h3 className="text-xs sm:text-[13px] font-bold text-foreground mb-0.5">{item.title}</h3>
              <p className="text-[10px] sm:text-[11px] text-muted-foreground">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Download ── */}
      {config.downloadUrl && (
        <section className="w-full max-w-3xl mx-auto px-5 sm:px-8 pb-12 sm:pb-16">
          <div className="bg-card border border-border rounded-2xl p-6 sm:p-8 text-center shadow-sm">
            <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Download className="w-7 h-7 text-primary" />
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-foreground mb-1">حمّل التطبيق الآن</h2>
            <p className="text-xs sm:text-sm text-muted-foreground mb-1">الإصدار {config.appVersion}</p>
            {config.changelog && (
              <p className="text-[11px] sm:text-xs text-muted-foreground mb-4 bg-muted rounded-xl px-3 py-2 inline-block">{config.changelog}</p>
            )}
            <div>
              <Button
                size="lg"
                className="font-bold rounded-xl h-12 px-8"
                onClick={() => window.open(config.downloadUrl, "_blank")}
              >
                <Download className="w-5 h-5 ml-2" />
                تحميل APK
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground mt-3">حمّل أحدث نسخة وثبّتها على جهازك</p>
          </div>
        </section>
      )}

      {/* ── Contact ── */}
      {config.whatsappContact && (
        <section className="bg-primary/5 border-t border-border py-8 sm:py-10 lg:py-12">
          <div className="max-w-3xl mx-auto px-5 sm:px-8 text-center">
            <h3 className="text-base sm:text-lg font-bold text-foreground mb-2">عندك سؤال؟</h3>
            <p className="text-sm text-muted-foreground mb-4">فريقنا جاهز لمساعدتك</p>
            <Button
              variant="outline"
              className="font-bold rounded-xl h-11 sm:h-12 px-6 border-primary/30 text-primary hover:bg-primary hover:text-primary-foreground transition-colors"
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
        <p className="text-[10px] sm:text-[11px] text-muted-foreground">
          تطبيق تحويل الرصيد © {new Date().getFullYear()} — جميع الحقوق محفوظة
        </p>
      </footer>
    </div>
  );
};

export default Landing;
