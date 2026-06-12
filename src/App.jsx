import React, { useState } from 'react';
import Header from './components/layout/Header';
import Hero from './components/sections/Hero';
import Properties from './components/sections/Properties';
import Services from './components/sections/Services';
import HowItWorks from './components/sections/HowItWorks';
import Testimonials from './components/sections/Testimonials';
import FAQ from './components/sections/FAQ';
import Contact from './components/sections/Contact';
import Footer from './components/layout/Footer';
import Dashboard from './components/dashboard/Dashboard';
import { MessageCircle, BarChart2, Home } from 'lucide-react';

function App() {
  const [view, setView] = useState('home');

  if (view === 'dashboard') {
    return (
      <>
        <button
          onClick={() => setView('home')}
          style={{
            position: 'fixed', top: 16, left: 16, zIndex: 9999,
            display: 'flex', alignItems: 'center', gap: 6,
            background: '#6366f1', color: '#fff', border: 'none',
            borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 14,
          }}
        >
          <Home size={15} /> Inicio
        </button>
        <Dashboard />
      </>
    );
  }

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

      {/* Dashboard Button */}
      <button
        onClick={() => setView('dashboard')}
        style={{
          position: 'fixed', bottom: 96, right: 24, zIndex: 40,
          display: 'flex', alignItems: 'center', gap: 6,
          background: '#6366f1', color: '#fff', border: 'none',
          borderRadius: '50%', width: 56, height: 56, cursor: 'pointer',
          justifyContent: 'center', boxShadow: '0 4px 14px rgba(99,102,241,0.5)',
        }}
        title="Copilot Dashboard"
      >
        <BarChart2 size={26} />
      </button>
    </div>
  );
}

export default App;
