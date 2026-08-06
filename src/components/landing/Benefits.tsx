import { motion } from "framer-motion";
import { ArrowRight, Clock, DollarSign, Shield, Zap } from "lucide-react";

const benefits = [
  {
    icon: Clock,
    title: "Manual Transfer",
    description: "Time-consuming process with multiple steps and waiting",
    time: "5-15 minutes",
    color: "muted",
  },
  {
    icon: Zap,
    title: "Quick USSD Dial",
    description: "Instant balance transfer with a single tap",
    time: "Under 10 seconds",
    color: "primary",
  },
];

const comparisonItems = [
  { label: "Speed", manual: "Slow", app: "Instant", icon: Zap },
  { label: "Ease of Use", manual: "Complex", app: "One Tap", icon: Shield },
  { label: "Reliability", manual: "Variable", app: "100%", icon: Shield },
  { label: "Support", manual: "None", app: "24/7", icon: Shield },
  { label: "Reports", manual: "No", app: "Yes", icon: Shield },
  { label: "Languages", manual: "One", app: "2 (AR/EN)", icon: Shield },
];

const Benefits = () => {
  return (
    <section className="py-24 relative">
      <div className="absolute inset-0 bg-gradient-to-b from-background via-accent/5 to-background" />
      <div className="relative z-10 container mx-auto px-4">
        <motion.div
          className="text-center max-w-2xl mx-auto mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            Why Quick USSD Dial?
          </h2>
          <p className="text-muted-foreground text-lg">
            Stop wasting time with manual transfers. Switch to the smarter way.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-16">
          {benefits.map((benefit, i) => (
            <motion.div
              key={i}
              className={`relative p-8 rounded-3xl border border-border/50 ${benefit.color === "primary" ? "bg-primary/5 border-primary/20" : "bg-muted/30"}`}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
            >
              <div className="flex items-center gap-3 mb-4">
                <benefit.icon className="w-6 h-6" />
                <h3 className="text-xl font-bold">{benefit.title}</h3>
              </div>
              <p className="text-muted-foreground mb-4">
                {benefit.description}
              </p>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Time:</span>
                <span className={`font-semibold ${benefit.color === "primary" ? "text-primary" : "text-foreground"}`}>
                  {benefit.time}
                </span>
              </div>
            </motion.div>
          ))}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full max-w-3xl mx-auto">
            <thead>
              <tr className="border-b border-border/50">
                <th className="text-left py-4 px-4 text-muted-foreground font-medium">Feature</th>
                <th className="text-center py-4 px-4 text-muted-foreground font-medium">Manual</th>
                <th className="text-center py-4 px-4 text-primary font-medium">Quick USSD Dial</th>
              </tr>
            </thead>
            <tbody>
              {comparisonItems.map((item, i) => (
                <motion.tr
                  key={i}
                  className="border-b border-border/30"
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: i * 0.05 }}
                >
                  <td className="py-4 px-4 font-medium flex items-center gap-2">
                    <item.icon className="w-4 h-4 text-primary/60" />
                    {item.label}
                  </td>
                  <td className="py-4 px-4 text-center text-muted-foreground">
                    {item.manual}
                  </td>
                  <td className="py-4 px-4 text-center">
                    <span className="inline-flex items-center gap-1 text-primary font-semibold">
                      {item.app}
                      <ArrowRight className="w-3 h-3" />
                    </span>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
};

export default Benefits;