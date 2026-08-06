import { motion } from "framer-motion";
import { Check, Crown, Sparkles, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";

const pricing = [
  {
    name: "One Year",
    price: "120,000",
    currency: "SYP",
    period: "year",
    features: [
      "Technical Support",
      "Updates",
      "License",
      "1 Device",
    ],
    popular: false,
    bestValue: false,
  },
  {
    name: "Two Years",
    price: "200,000",
    currency: "SYP",
    period: "2 years",
    features: [
      "Technical Support",
      "Updates",
      "License",
      "1 Device",
      "50% Savings",
    ],
    popular: true,
    bestValue: false,
  },
  {
    name: "Three Years",
    price: "300,000",
    currency: "SYP",
    period: "3 years",
    features: [
      "Technical Support",
      "Updates",
      "License",
      "1 Device",
      "Best Value",
      "Priority Support",
    ],
    popular: false,
    bestValue: true,
  },
];

const Pricing = () => {
  return (
    <section id="pricing" className="py-24 relative">
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
            Simple Pricing
          </h2>
          <p className="text-muted-foreground text-lg">
            Choose the plan that works for you. All plans include core features.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {pricing.map((plan, i) => (
            <motion.div
              key={i}
              className={`relative p-8 rounded-3xl border transition-all duration-300 hover:-translate-y-1 ${
                plan.popular
                  ? "border-primary bg-primary/5 shadow-xl shadow-primary/10"
                  : plan.bestValue
                  ? "border-cyan/30 bg-cyan/5 shadow-xl shadow-cyan/10"
                  : "border-border/50 bg-card/50"
              }`}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.15 }}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-primary text-primary-foreground text-sm font-semibold">
                  Most Popular
                </div>
              )}
              {plan.bestValue && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-cyan text-foreground text-sm font-semibold">
                  Best Value
                </div>
              )}

              <div className="text-center mb-8">
                <h3 className="text-xl font-bold mb-2">
                  {plan.name}
                </h3>
                <div className="flex items-baseline justify-center gap-1">
                  <span className="text-4xl font-bold">
                    {plan.price}
                  </span>
                  <span className="text-muted-foreground">
                    {plan.currency}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  per {plan.period}
                </p>
              </div>

              <ul className="space-y-3 mb-8">
                {plan.features.map((feature, j) => (
                  <li key={j} className="flex items-center gap-3 text-sm">
                    <Check className="w-4 h-4 text-primary shrink-0" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <Button
                className={`w-full h-12 rounded-2xl text-lg font-semibold ${
                  plan.popular || plan.bestValue
                    ? "bg-primary hover:bg-primary-hover"
                    : ""
                }`}
                variant={plan.popular || plan.bestValue ? "default" : "outline"}
              >
                {plan.popular ? "Get Started" : "Choose Plan"}
              </Button>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Pricing;