import { useState, useEffect } from "react";
import {
  Zap, Shield, Clock, Phone, Users, Star, CheckCircle,
  Download, MessageCircle, ChevronDown, Smartphone, BarChart3, ArrowLeft
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { getPackages, getAppConfig, type AppPackage, type AppConfig } from "@/lib/marketing";

const Landing = () => {
  const [packages, setPackages] = useState<AppPackage[]>([]);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [selectedPkg, setSelectedPkg] = useState<string | null>(null);

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

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary/90 to-primary/70" />
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 right-20 w-64 h-64 rounded-full bg-white/20 blur-3xl" />
          <div className="absolute bottom-10 left-10 w-48 h-48 rounded-full bg-white/15 blur-2xl" />
        </div>

        <div className="relative max-w-lg mx-auto px-6 pt-12 pb-16 text-center">
          <div className="inline-flex items-center gap-2 bg-white/15 backdrop-blur-sm rounded-full px-4 py-1.5 mb-6">
            <Zap className="w-4 h-4 text-yellow-300" />
            <span className="text-sm text-white/90 font-medium">الأسرع في سوريا</span>
          </div>

          <h1 className="text-3xl font-black text-white leading-tight mb-4">
            {config.heroTitle}
          </h1>
          <p className="text-base text-white/80 leading-relaxed mb-8">
            {config.heroSubtitle}
          </p>

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
            {config.downloadUrl && (
              <Button
                size="lg"
                className="bg-white text-primary hover:bg-white/90 font-bold rounded-xl h-12 px-6 text-base shadow-lg"
                onClick={() => window.open(config.downloadUrl, '_blank')}
              >
                <Download className="w-5 h-5 ml-2" />
                تحميل التطبيق
              </Button>
            )}
            <Button
              size="lg"
              variant="outline"
              className="border-2 border-white/30 text-white hover:bg-white/10 font-bold rounded-xl h-12 px-6 text-base"
              onClick={() => scrollToSection('pricing')}
            >
              عرض الباقات
              <ChevronDown className="w-4 h-4 mr-1" />
            </Button>
          </div>

          {/* Version badge */}
          <p className="mt-6 text-xs text-white/50">
            الإصدار {config.appVersion}
          </p>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-lg mx-auto px-5 py-12">
        <h2 className="text-xl font-bold text-foreground text-center mb-8">لماذا تختار تطبيقنا؟</h2>
        <div className="grid grid-cols-2 gap-3">
          {[
            { icon: Zap, title: 'تحويل فوري', desc: 'تنفيذ USSD مباشر بدون تأخير', color: 'text-yellow-500 bg-yellow-500/10' },
            { icon: Shield, title: 'آمن 100%', desc: 'بياناتك محفوظة على جهازك فقط', color: 'text-green-500 bg-green-500/10' },
            { icon: Smartphone, title: 'شريحتين', desc: 'دعم سيريتل و MTN معاً', color: 'text-blue-500 bg-blue-500/10' },
            { icon: Clock, title: 'أوفلاين', desc: 'يعمل بدون انترنت', color: 'text-purple-500 bg-purple-500/10' },
            { icon: Users, title: 'إدارة الموزع', desc: 'تتبع حسابك مع الموزع', color: 'text-orange-500 bg-orange-500/10' },
            { icon: BarChart3, title: 'تقارير ذكية', desc: 'إحصائيات يومية وشهرية', color: 'text-cyan-500 bg-cyan-500/10' },
          ].map((f, i) => (
            <div key={i} className="bg-card border border-border rounded-2xl p-4 shadow-sm hover:shadow-md transition-all">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${f.color}`}>
                <f.icon className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-foreground mb-1">{f.title}</h3>
              <p className="text-[11px] text-muted-foreground leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="bg-muted/30 py-12">
        <div className="max-w-lg mx-auto px-5">
          <h2 className="text-xl font-bold text-foreground text-center mb-2">اختر باقتك</h2>
          <p className="text-sm text-muted-foreground text-center mb-8">أسعار مناسبة للسوق السورية</p>

          <div className="space-y-3">
            {packages.map((pkg) => (
              <div
                key={pkg.id}
                onClick={() => setSelectedPkg(selectedPkg === pkg.id ? null : pkg.id)}
                className={`relative bg-card border-2 rounded-2xl p-5 cursor-pointer transition-all ${
                  pkg.popular
                    ? 'border-primary shadow-lg'
                    : selectedPkg === pkg.id
                      ? 'border-primary/50 shadow-md'
                      : 'border-border hover:border-primary/30'
                }`}
              >
                {pkg.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-[10px] font-bold px-3 py-1 rounded-full flex items-center gap-1">
                    <Star className="w-3 h-3" />
                    الأكثر طلباً
                  </div>
                )}

                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-base font-bold text-foreground">{pkg.name}</h3>
                    <p className="text-[11px] text-muted-foreground">{pkg.durationLabel}</p>
                  </div>
                  <div className="text-left">
                    {pkg.price === 0 ? (
                      <span className="text-2xl font-black text-primary">مجاني</span>
                    ) : (
                      <>
                        <span className="text-2xl font-black text-foreground">{pkg.price.toLocaleString()}</span>
                        <span className="text-xs text-muted-foreground mr-1">{pkg.currency}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Features list */}
                <div className={`space-y-1.5 overflow-hidden transition-all ${
                  selectedPkg === pkg.id || pkg.popular ? 'max-h-96 opacity-100 mt-3' : 'max-h-0 opacity-0'
                }`}>
                  {pkg.features.map((f, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <CheckCircle className="w-3.5 h-3.5 text-primary shrink-0" />
                      <span className="text-xs text-foreground">{f}</span>
                    </div>
                  ))}
                  <Button
                    className="w-full mt-3 h-10 font-bold rounded-xl"
                    variant={pkg.price === 0 ? 'outline' : 'default'}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (pkg.price === 0 && config.downloadUrl) {
                        window.open(config.downloadUrl, '_blank');
                      } else {
                        handleContact(pkg);
                      }
                    }}
                  >
                    {pkg.price === 0 ? (
                      <>
                        <Download className="w-4 h-4 ml-1" />
                        جرّب الآن
                      </>
                    ) : (
                      <>
                        <MessageCircle className="w-4 h-4 ml-1" />
                        اطلب عبر واتساب
                      </>
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Download Section */}
      {config.downloadUrl && (
        <section className="max-w-lg mx-auto px-5 py-12 text-center">
          <div className="bg-gradient-to-br from-primary/5 to-primary/10 border border-primary/20 rounded-2xl p-6">
            <Smartphone className="w-12 h-12 text-primary mx-auto mb-4" />
            <h2 className="text-lg font-bold text-foreground mb-2">حمّل التطبيق الآن</h2>
            <p className="text-sm text-muted-foreground mb-1">الإصدار {config.appVersion}</p>
            {config.changelog && (
              <p className="text-xs text-muted-foreground mb-4 bg-muted rounded-lg p-2">{config.changelog}</p>
            )}
            <Button
              size="lg"
              className="font-bold rounded-xl h-12 px-8"
              onClick={() => window.open(config.downloadUrl, '_blank')}
            >
              <Download className="w-5 h-5 ml-2" />
              تحميل APK
            </Button>
            <p className="text-[10px] text-muted-foreground mt-3">حمّل أحدث نسخة وثبّتها على جهازك</p>
          </div>
        </section>
      )}

      {/* Contact */}
      {config.whatsappContact && (
        <section className="bg-card border-t border-border py-8">
          <div className="max-w-lg mx-auto px-5 text-center">
            <p className="text-sm text-muted-foreground mb-3">للاستفسار أو الدعم الفني</p>
            <Button
              variant="outline"
              className="font-bold rounded-xl h-11 px-6"
              onClick={() => handleContact()}
            >
              <MessageCircle className="w-4 h-4 ml-2" />
              تواصل عبر واتساب
            </Button>
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="py-6 text-center">
        <p className="text-[11px] text-muted-foreground">
          تطبيق تحويل الرصيد © {new Date().getFullYear()} — جميع الحقوق محفوظة
        </p>
      </footer>
    </div>
  );
};

export default Landing;
