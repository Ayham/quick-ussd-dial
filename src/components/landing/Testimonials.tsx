import { motion } from "framer-motion";
import { Star, Quote } from "lucide-react";

const testimonials = [
  {
    name: "Ahmed Al-Hassan",
    role: "MTN User",
    text: "Quick USSD Dial is a game changer. Transferring balance takes seconds now instead of minutes. The interface is clean and easy to use.",
    rating: 5,
  },
  {
    name: "Sara Mahmoud",
    role: "Syriatel User",
    text: "I've been using this app for over a year. The dual SIM support is amazing and the automatic operator detection works perfectly every time.",
    rating: 5,
  },
  {
    name: "Omar Khalil",
    role: "Business Owner",
    text: "We use Quick USSD Dial for our team. The license system is secure and the reports feature helps us track all transfers efficiently.",
    rating: 5,
  },
  {
    name: "Layla Haddad",
    role: "Daily User",
    text: "The offline mode is a lifesaver. I can check my balance even without internet. Best balance transfer app available.",
    rating: 5,
  },
];

const Testimonials = () => {
  return (
    <section className="py-24 relative">
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
            What Our Users Say
          </h2>
          <p className="text-muted-foreground text-lg">
            Trusted by thousands of users across Syria
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl mx-auto">
          {testimonials.map((testimonial, i) => (
            <motion.div
              key={i}
              className="relative p-6 rounded-2xl border border-border/50 bg-card/50 backdrop-blur-sm hover:border-primary/20 transition-all duration-300 hover:-translate-y-1"
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
            >
              <Quote className="w-8 h-8 text-primary/20 mb-4" />
              <div className="flex gap-1 mb-4">
                {Array.from({ length: testimonial.rating }).map((_, j) => (
                  <Star key={j} className="w-4 h-4 fill-primary text-primary" />
                ))}
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed mb-6">
                "{testimonial.text}"
              </p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-sm font-bold text-primary">
                    {testimonial.name.charAt(0)}
                  </span>
                </div>
                <div>
                  <p className="font-semibold text-sm">
                    {testimonial.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {testimonial.role}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Testimonials;