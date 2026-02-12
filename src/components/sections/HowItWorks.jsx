import React from 'react';
import { ClipboardCheck, FilePlus, Home, TrendingUp } from 'lucide-react';
import Button from '../common/Button';

const steps = [
    { id: 1, title: 'Evaluación', desc: 'Analizamos el potencial de tu inmueble.', icon: ClipboardCheck },
    { id: 2, title: 'Preparación', desc: 'Decoración, fotos pro y alta en plataformas.', icon: FilePlus },
    { id: 3, title: 'Operación', desc: 'Gestionamos reservas, limpieza y atención 24/7.', icon: Home },
    { id: 4, title: 'Ingresos', desc: 'Recibe tus ganancias y reportes mensuales.', icon: TrendingUp },
];

const HowItWorks = () => {
    return (
        <section id="how" className="section bg-neutral">
            <div className="container">
                <div className="text-center mb-16 animate-fade-in">
                    <h2 className="text-4xl font-display font-bold text-primary mb-4">Cómo funciona</h2>
                    <p className="text-gray-600">Tu camino hacia ingresos pasivos sin complicaciones.</p>
                </div>

                <div className="grid md:grid-cols-4 gap-8 mb-12">
                    {steps.map((step) => (
                        <div key={step.id} className="text-center group hover:-translate-y-2 transition-transform duration-300">
                            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm group-hover:shadow-md transition-shadow">
                                <step.icon size={32} className="text-primary group-hover:text-secondary transition-colors" />
                            </div>
                            <div className="w-8 h-8 bg-primary text-white rounded-full flex items-center justify-center mx-auto mb-4 font-bold text-sm">
                                {step.id}
                            </div>
                            <h3 className="text-xl font-bold mb-2">{step.title}</h3>
                            <p className="text-gray-600 text-sm px-4">{step.desc}</p>
                        </div>
                    ))}
                </div>

                <div className="text-center">
                    <Button href="#contact" variant="primary">
                        Empezar ahora
                    </Button>
                </div>
            </div>
        </section>
    );
};

export default HowItWorks;
