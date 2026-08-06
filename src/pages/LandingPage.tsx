import { motion } from "framer-motion";
import Hero from "@/components/landing/Hero";
import Features from "@/components/landing/Features";
import HowItWorks from "@/components/landing/HowItWorks";
import Screenshots from "@/components/landing/Screenshots";
import Benefits from "@/components/landing/Benefits";
import Pricing from "@/components/landing/Pricing";
import Testimonials from "@/components/landing/Testimonials";
import FAQ from "@/components/landing/FAQ";
import DownloadSection from "@/components/landing/DownloadSection";
import Contact from "@/components/landing/Contact";
import Footer from "@/components/landing/Footer";
import { Navbar } from "@/components/landing/Navbar";

const LandingPage = () => {
  return (
    <div className="min-h-dvh bg-background">
      <Navbar />
      <main>
        <Hero />
        <Features />
        <HowItWorks />
        <Screenshots />
        <Benefits />
        <Pricing />
        <Testimonials />
        <FAQ />
        <DownloadSection />
        <Contact />
      </main>
      <Footer />
    </div>
  );
};

export default LandingPage;