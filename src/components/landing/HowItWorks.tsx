import { motion } from "framer-motion";
import { Download, CheckCircle, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

const steps = [
  {
    icon: Download,
    number: "01",
    title: "Download",
    description: "Download Quick USSD Dial from Google Play Store or get the APK directly.",
  },
  {
    icon: CheckCircle,
    number: "02",
    title: "Activate",
    description: "Purchase a license and activate your app. Simple and secure.",
  },
  {
    icon: Rocket,
    number: "03",
    title: "Start Using",
    description: "Start transferring balance instantly with just one tap.",
  },
];

const HowItWorks = () => {
  return (
    <section id="how-it-works" className="py-24 relative">
      <div className="absolute inset-0 bg-gradient-to-b from-background via-primary/5 to-background" />
      <div className="relative z-10 container mx-auto px-4">
        <motion.div
          className="text-center max-w-2xl mx-auto mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            How It Works
          </h2>
          <p className="text-muted-foreground text-lg">
            Get started in three simple steps
          </p>
        </motion.div>

        <div className="relative">
          <div className="hidden lg:block absolute top-1/2 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-primary/20 to-transparent" />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 lg:gap-12">
            {steps.map((step, i) => (
              <motion.div
                key={i}
                className="relative text-center"
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: i * 0.2 }}
              >
                <div className="relative inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary/10 border-2 border-primary/20 mb-6">
                  <step.icon className="w-8 h-8 text-primary" />
                  <span className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-bold flex items-center justify-center">
                    {step.number}
                  </span>
                </div>
                <h3 className="text-xl font-bold mb-3">{step.title}</h3>
                <p className="text-muted-foreground max-w-xs mx-auto">
                  {step.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>

        <motion.div
          className="text-center mt-12"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.6 }}
        >
          <Link to="/download">
            <Button size="lg" className="h-12 px-8 rounded-2xl text-lg">
              Get Started Now
            </Button>
          </Link>
        </motion.div>
      </div>
    </section>
  );
};

export default HowItWorks;