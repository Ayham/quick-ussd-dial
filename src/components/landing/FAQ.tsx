import { motion } from "framer-motion";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { HelpCircle } from "lucide-react";

const faqs = [
  {
    question: "How does Quick USSD Dial work?",
    answer: "Quick USSD Dial uses USSD codes to transfer balance between mobile numbers on MTN and Syriatel networks. Simply enter the recipient number and amount, and the app handles the rest automatically.",
  },
  {
    question: "Is it safe and secure?",
    answer: "Yes, our app uses enterprise-grade security. Your license is protected, and all transactions are encrypted. We never store your personal data on our servers.",
  },
  {
    question: "Can I use it on dual SIM phones?",
    answer: "Absolutely! Quick USSD Dial fully supports dual SIM devices with automatic SIM selection, so you can transfer from either SIM card.",
  },
  {
    question: "Do I need internet to use the app?",
    answer: "Balance inquiries work offline via USSD codes. Transfers require a brief data connection to process the transaction, but the app works primarily through USSD.",
  },
  {
    question: "What networks are supported?",
    answer: "Quick USSD Dial supports both MTN and Syriatel networks in Syria. We plan to add more networks in future updates.",
  },
  {
    question: "How do I activate my license?",
    answer: "After purchasing a license, you will receive a license key via email. Enter the key in the app settings to activate your premium features.",
  },
  {
    question: "Can I get a refund?",
    answer: "We offer a 7-day money-back guarantee if you are not satisfied with the app. Contact our support team for assistance.",
  },
  {
    question: "How often are updates released?",
    answer: "We release updates regularly with new features, bug fixes, and performance improvements. All updates are free for license holders.",
  },
];

const FAQ = () => {
  return (
    <section id="faq" className="py-24 relative">
      <div className="absolute inset-0 bg-gradient-to-b from-background via-muted/20 to-background" />
      <div className="relative z-10 container mx-auto px-4 max-w-3xl">
        <motion.div
          className="text-center max-w-2xl mx-auto mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            Frequently Asked Questions
          </h2>
          <p className="text-muted-foreground text-lg">
            Everything you need to know about Quick USSD Dial
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <Accordion type="single" collapsible className="w-full space-y-3">
            {faqs.map((faq, i) => (
              <AccordionItem
                key={i}
                value={`item-${i}`}
                className="rounded-xl border border-border/50 bg-card/50 px-6 overflow-hidden"
              >
                <AccordionTrigger className="text-left font-semibold hover:no-underline py-5">
                  <span className="flex items-center gap-3">
                    <HelpCircle className="w-5 h-5 text-primary shrink-0" />
                    {faq.question}
                  </span>
                </AccordionTrigger>
                <AccordionContent className="pb-5 text-muted-foreground leading-relaxed">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </motion.div>
      </div>
    </section>
  );
};

export default FAQ;