import { motion } from "framer-motion";
import { Mail, MessageCircle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";

const Contact = () => {
  const contactMethods = [
    {
      icon: Mail,
      title: "Email",
      value: "support@blueorbit.tech",
      href: "mailto:support@blueorbit.tech",
      description: "Response within 24 hours",
    },
    {
      icon: MessageCircle,
      title: "WhatsApp",
      value: "+963 999 123 456",
      href: "https://wa.me/963999123456",
      description: "Instant support",
    },
    {
      icon: Send,
      title: "Telegram",
      value: "@QuickUssdDial",
      href: "https://t.me/QuickUssdDial",
      description: "Community & updates",
    },
  ];

  return (
    <section id="contact" className="py-24 relative">
      <div className="absolute inset-0 bg-gradient-to-b from-background via-accent/5 to-background" />
      <div className="relative z-10 container mx-auto px-4 max-w-4xl">
        <motion.div
          className="text-center max-w-2xl mx-auto mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            Get In Touch
          </h2>
          <p className="text-muted-foreground text-lg">
            We are here to help. Reach out to us through any channel.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {contactMethods.map((method, i) => (
            <motion.a
              key={i}
              href={method.href}
              target="_blank"
              rel="noopener noreferrer"
              className="group relative p-6 rounded-2xl border border-border/50 bg-card/50 backdrop-blur-sm hover:border-primary/30 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-primary/5 block"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
            >
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                <method.icon className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-semibold text-lg mb-1">
                {method.title}
              </h3>
              <p className="text-sm text-primary font-medium mb-2">
                {method.value}
              </p>
              <p className="text-xs text-muted-foreground">
                {method.description}
              </p>
            </motion.a>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Contact;