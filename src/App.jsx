import React from 'react';
import Header from './components/layout/Header';
import Hero from './components/sections/Hero';
import Properties from './components/sections/Properties';
import Services from './components/sections/Services';
import HowItWorks from './components/sections/HowItWorks';
import Testimonials from './components/sections/Testimonials';
import FAQ from './components/sections/FAQ';
import Contact from './components/sections/Contact';
import Footer from './components/layout/Footer';
import { MessageCircle } from 'lucide-react';
import SiigoAnalyticsApp from './siigo-analytics/SiigoAnalyticsApp';

function App() {
  const isSiigo = window.location.hash === "#/siigo-analytics";
  if (isSiigo) return <SiigoAnalyticsApp />;

  return (
    <div className="min-h-screen flex flex-col font-sans">
      <Header />

      <main className="flex-grow">
        <Hero />
        <Properties />
        <Services />
        <HowItWorks />
        <Testimonials />
        <FAQ />
        <Contact />
      </main>

      <Footer />

      {/* WhatsApp Button */}
      <a
        href="https://wa.me/573165318861?text=Hola,%20me%20gustar%C3%ADa%20m%C3%A1s%20informaci%C3%B3n%20sobre%20sus%20servicios"
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-6 right-6 z-40 bg-green-500 hover:bg-green-600 text-white p-3 rounded-full shadow-lg transition-all animate-fade-in hover:scale-110 flex items-center justify-center w-14 h-14"
        aria-label="Contactar por WhatsApp"
      >
        <MessageCircle size={32} />
      </a>
    </div>
  );
}

export default App;
