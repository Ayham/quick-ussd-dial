import { motion } from "framer-motion";
import { Download, Smartphone, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

const DownloadSection = () => {
  return (
    <section id="download" className="py-24 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-cyan/10" />
      <div className="absolute inset-0 overflow-hidden">
        <motion.div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/5 rounded-full blur-3xl"
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.5, 0.3],
          }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      <div className="relative z-10 container mx-auto px-4 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <div className="w-20 h-20 rounded-3xl bg-primary/10 flex items-center justify-center mx-auto mb-8">
            <Smartphone className="w-10 h-10 text-primary" />
          </div>

          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-4">
            Ready to Get Started?
          </h2>
          <p className="text-muted-foreground text-lg max-w-xl mx-auto mb-10">
            Download Quick USSD Dial now and experience the fastest balance transfer on your phone.
          </p>

          <Link to="https://play.google.com/store/apps/details?id=com.blueorbit.quickussddial">
            <Button
              size="lg"
              className="h-16 px-10 rounded-2xl text-xl font-semibold shadow-xl shadow-primary/25 hover:shadow-2xl hover:shadow-primary/30 transition-all duration-300 hover:scale-105"
            >
              <Download className="w-6 h-6 me-3" />
              Download Android Application
            </Button>
          </Link>

          <p className="text-sm text-muted-foreground mt-6">
            Free to download • No hidden fees • Secure payment
          </p>
        </motion.div>
      </div>
    </section>
  );
};

export default DownloadSection;