import { motion } from "framer-motion";
import {
  Smartphone,
  Wifi,
  SmartphoneChart,
  SimCards,
  RefreshCw,
  PhoneCall,
  WifiOff,
  FileText,
  BarChart3,
  ShieldCheck,
  Rocket,
  Globe,
  Clock,
  CloudUpload,
  LayoutGrid,
} from "lucide-react";

const features = [
  {
    icon: Smartphone,
    title: "One Click Transfer",
    description: "Transfer balance with a single tap. Fast, simple, and reliable.",
  },
  {
    icon: SimCards,
    title: "Syriatel Support",
    description: "Full support for Syriatel network balance transfers.",
  },
  {
    icon: Wifi,
    title: "MTN Support",
    description: "Seamless balance transfer for MTN network users.",
  },
  {
    icon: RefreshCw,
    title: "Smart Operator Detection",
    description: "Automatically detects the operator and optimizes the transfer.",
  },
  {
    icon: SimCards,
    title: "Dual SIM",
    description: "Support for dual SIM devices with automatic SIM selection.",
  },
  {
    icon: SmartphoneChart,
    title: "Automatic SIM Selection",
    description: "Intelligently selects the right SIM for each transfer.",
  },
  {
    icon: PhoneCall,
    title: "Balance Inquiry",
    description: "Check your balance instantly with USSD codes.",
  },
  {
    icon: WifiOff,
    title: "Offline Operation",
    description: "Works even without internet for balance inquiries.",
  },
  {
    icon: FileText,
    title: "Reports",
    description: "Detailed transfer history and transaction reports.",
  },
  {
    icon: BarChart3,
    title: "Statistics",
    description: "Track your transfer activity with beautiful statistics.",
  },
  {
    icon: ShieldCheck,
    title: "Secure License System",
    description: "Enterprise-grade security for your license and data.",
  },
  {
    icon: Rocket,
    title: "Fast Performance",
    description: "Lightning-fast transfers with minimal latency.",
  },
  {
    icon: Globe,
    title: "Arabic & English",
    description: "Full bilingual support for Arabic and English.",
  },
  {
    icon: LayoutGrid,
    title: "Modern User Interface",
    description: "Clean, intuitive, and beautiful interface design.",
  },
  {
    icon: CloudUpload,
    title: "Automatic Backup",
    description: "Your data is automatically backed up and safe.",
  },
];

const Features = () => {
  return (
    <section id="features" className="py-24 relative">
      <div className="absolute inset-0 bg-gradient-to-b from-background via-muted/20 to-background" />
      <div className="relative z-10 container mx-auto px-4">
        <motion.div
          className="text-center max-w-2xl mx-auto mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            Powerful Features
          </h2>
          <p className="text-muted-foreground text-lg">
            Everything you need for quick and easy balance transfers
          </p>
        </motion.div>

        <motion.div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={{
            visible: {
              transition: { staggerChildren: 0.05 },
            },
          }}
        >
          {features.map((feature, i) => (
            <motion.div
              key={i}
              className="group relative p-6 rounded-2xl border bg-card/50 backdrop-blur-sm border-border/50 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300 hover:-translate-y-1"
              variants={{
                hidden: { opacity: 0, y: 20 },
                visible: { opacity: 1, y: 0 },
              }}
              transition={{ duration: 0.4, delay: i * 0.03 }}
            >
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                <feature.icon className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-semibold text-lg mb-2">
                {feature.title}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
};

export default Features;