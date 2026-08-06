import { motion } from "framer-motion";
import { Smartphone, Monitor } from "lucide-react";

const Screenshots = () => {
  const screenshots = [
    { label: "Home Screen", color: "from-primary/20 to-primary/5" },
    { label: "Transfer", color: "from-cyan/20 to-cyan/5" },
    { label: "Reports", color: "from-blue/20 to-blue/5" },
    { label: "Settings", color: "from-emerald/20 to-emerald/5" },
  ];

  return (
    <section id="screenshots" className="py-24 relative">
      <div className="absolute inset-0 bg-gradient-to-b from-background via-muted/10 to-background" />
      <div className="relative z-10 container mx-auto px-4">
        <motion.div
          className="text-center max-w-2xl mx-auto mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            See It in Action
          </h2>
          <p className="text-muted-foreground text-lg">
            Beautiful, intuitive interface designed for speed
          </p>
        </motion.div>

        <div className="flex justify-center gap-8 flex-wrap">
          {screenshots.map((ss, i) => (
            <motion.div
              key={i}
              className="relative group"
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.15 }}
            >
              <div className="relative w-64 h-[480px] rounded-[3rem] border-4 border-border/50 bg-gradient-to-b from-card to-muted p-3 shadow-2xl group-hover:shadow-primary/10 transition-shadow duration-500 group-hover:-translate-y-2">
                <div className={`w-full h-full rounded-[2rem] bg-gradient-to-br ${ss.color} flex items-center justify-center overflow-hidden`}>
                  <div className="text-center space-y-3 p-6">
                    <div className="w-16 h-16 rounded-2xl bg-primary/20 mx-auto flex items-center justify-center">
                      <Smartphone className="w-8 h-8 text-primary" />
                    </div>
                    <p className="text-sm font-medium text-foreground/80">
                      {ss.label}
                    </p>
                    <div className="space-y-2 mt-4">
                      <div className="h-2 w-20 rounded-full bg-primary/20 mx-auto" />
                      <div className="h-2 w-16 rounded-full bg-primary/10 mx-auto" />
                      <div className="h-2 w-24 rounded-full bg-primary/15 mx-auto" />
                    </div>
                  </div>
                </div>
                <div className="absolute top-6 left-1/2 -translate-x-1/2 w-20 h-1 bg-black/20 rounded-full" />
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-16 h-1 bg-black/10 rounded-full" />
              </div>
              <p className="text-center text-sm text-muted-foreground mt-4">
                {ss.label}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Screenshots;