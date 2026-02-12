import React, { useState } from 'react';
import { services } from '../../data/mockData';
import { ShieldCheck, CalendarCheck, Home, Banknote } from 'lucide-react';
import Button from '../common/Button';

const Services = () => {
    const [activeTab, setActiveTab] = useState('owners');

    return (
        <section id="services" className="section bg-white">
            <div className="container">
                <div className="text-center mb-12 animate-fade-in">
                    <h2 className="text-4xl font-bold font-display text-primary mb-4">Nuestros Servicios</h2>
                    <p className="text-gray-600 max-w-2xl mx-auto">
                        Soluciones integrales para propietarios y experiencias memorables para huéspedes.
                    </p>
                </div>

                <div className="tab-container">
                    <button
                        className={`tab-btn ${activeTab === 'owners' ? 'active' : ''}`}
                        onClick={() => setActiveTab('owners')}
                    >
                        Para Dueños
                    </button>
                    <button
                        className={`tab-btn ${activeTab === 'guests' ? 'active' : ''}`}
                        onClick={() => setActiveTab('guests')}
                    >
                        Para Huéspedes
                    </button>
                </div>

                <div className="services-grid animate-fade-in">
                    {services[activeTab].map((service, index) => (
                        <div key={index} className="service-card">
                            <div className="service-icon">
                                {index === 0 && <Home size={28} />}
                                {index === 1 && <CalendarCheck size={28} />}
                                {index === 2 && <Banknote size={28} />}
                                {index === 3 && <ShieldCheck size={28} />}
                            </div>
                            <h3 className="text-xl font-bold mb-2">{service.title}</h3>
                            <p className="text-gray-600 mb-4">{service.desc}</p>
                        </div>
                    ))}
                </div>

                {activeTab === 'owners' && (
                    <div className="mt-16 bg-neutral rounded-lg p-8 animate-fade-in">
                        <div className="text-center mb-8">
                            <h3 className="text-3xl font-bold mb-4">Planes para Propietarios</h3>
                            <p className="text-gray-600">Elige el nivel de gestión que mejor se adapte a tus necesidades.</p>
                        </div>
                        <div className="grid md:grid-cols-3 gap-8">
                            {['Básico', 'Pro', 'Premium'].map((plan, idx) => (
                                <div key={plan} className="bg-white p-6 rounded-lg shadow-sm border border-gray-100 text-center hover:shadow-md transition-shadow">
                                    <h4 className="text-xl font-bold mb-4">{plan}</h4>
                                    <ul className="space-y-3 mb-6 text-left">
                                        <li className="flex items-center text-sm text-gray-600"><ShieldCheck size={16} className="text-secondary mr-2" /> Publicación en Airbnb</li>
                                        <li className="flex items-center text-sm text-gray-600"><ShieldCheck size={16} className="text-secondary mr-2" /> Gestión de reservas</li>
                                        {idx > 0 && <li className="flex items-center text-sm text-gray-600"><ShieldCheck size={16} className="text-secondary mr-2" /> Limpieza incluida</li>}
                                        {idx > 1 && <li className="flex items-center text-sm text-gray-600"><ShieldCheck size={16} className="text-secondary mr-2" /> Mantenimiento preventivo</li>}
                                    </ul>
                                    <Button variant={idx === 1 ? 'primary' : 'outline'} fullWidth href="#contact">
                                        Cotizar
                                    </Button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </section>
    );
};

export default Services;
