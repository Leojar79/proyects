import React from 'react';
import { ArrowRight, TrendingUp, ShieldCheck, Clock } from 'lucide-react';
import Button from '../common/Button';

const Hero = () => {
    return (
        <section id="hero" className="hero">
            <div className="hero-overlay"></div>
            <div className="container hero-content animate-fade-in">
                <h1 className="hero-title">
                    Rentas cortas sin complicaciones
                </h1>
                <p className="hero-subtitle">
                    Nosotros administramos tu inmueble y maximizamos tus ingresos mientras tú disfrutas de tu tiempo. Experiencia premium para dueños y huéspedes.
                </p>

                <div className="hero-buttons">
                    <Button href="#contact" variant="primary">
                        Recibir asesoría gratis <ArrowRight size={18} style={{ marginLeft: '8px' }} />
                    </Button>
                    <Button href="#properties" variant="secondary">
                        Ver propiedades
                    </Button>
                </div>

                <div className="hero-benefits">
                    <div className="benefit-badge">
                        <TrendingUp size={16} /> Mayor ocupación
                    </div>
                    <div className="benefit-badge">
                        <ShieldCheck size={16} /> Limpieza y mantenimiento
                    </div>
                    <div className="benefit-badge">
                        <Clock size={16} /> Atención 24/7
                    </div>
                </div>
            </div>
        </section>
    );
};

export default Hero;
