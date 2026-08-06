import { motion } from "framer-motion";
import { Heart, Mail, MessageCircle, Send } from "lucide-react";
import { Link } from "react-router-dom";

const Footer = () => {
  return (
    <footer className="border-t border-border/50 bg-muted/20">
      <div className="container mx-auto px-4 py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10 mb-12">
          <div className="md:col-span-2">
            <Link to="/" className="inline-flex items-center gap-2 mb-4">
              <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
                <span className="text-primary-foreground font-bold text-lg">Q</span>
              </div>
              <span className="text-xl font-bold">Quick USSD Dial</span>
            </Link>
            <p className="text-muted-foreground text-sm max-w-sm leading-relaxed mb-6">
              The fastest and easiest way to transfer balance between MTN and Syriatel networks. Built by Blue Orbit Technologies.
            </p>
            <div className="flex gap-4">
              <a href="mailto:support@blueorbit.tech" className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center hover:bg-primary/20 transition-colors" aria-label="Email">
                <Mail className="w-4 h-4 text-primary" />
              </a>
              <a href="https://wa.me/963999123456" target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center hover:bg-primary/20 transition-colors" aria-label="WhatsApp">
                <MessageCircle className="w-4 h-4 text-primary" />
              </a>
              <a href="https://t.me/QuickUssdDial" target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center hover:bg-primary/20 transition-colors" aria-label="Telegram">
                <Send className="w-4 h-4 text-primary" />
              </a>
            </div>
          </div>

          <div>
            <h4 className="font-semibold mb-4">Product</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link to="#features" className="hover:text-primary transition-colors">Features</Link></li>
              <li><Link to="#pricing" className="hover:text-primary transition-colors">Pricing</Link></li>
              <li><Link to="#download" className="hover:text-primary transition-colors">Download</Link></li>
              <li><Link to="#faq" className="hover:text-primary transition-colors">FAQ</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-4">Company</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link to="#contact" className="hover:text-primary transition-colors">Contact</Link></li>
              <li><a href="/privacy" className="hover:text-primary transition-colors">Privacy Policy</a></li>
              <li><a href="/terms" className="hover:text-primary transition-colors">Terms of Service</a></li>
              <li><span className="text-xs">© 2026 Blue Orbit Technologies</span></li>
            </ul>
          </div>
        </div>

        <div className="border-t border-border/50 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">
            © 2026 Blue Orbit Technologies. All rights reserved.
          </p>
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            Made with <Heart className="w-3 h-3 text-primary fill-primary" /> in Syria
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;