import React from 'react';
import { testimonials } from '../../data/mockData';
import { Star, User } from 'lucide-react';

const Testimonials = () => {
    return (
        <section id="testimonials" className="section bg-layout">
            <div className="container">
                <div className="text-center mb-16 animate-fade-in">
                    <h2 className="text-4xl font-bold font-display text-primary mb-4">Lo que dicen nuestros clientes</h2>
                    <p className="text-gray-600 max-w-2xl mx-auto">
                        La confianza de propietarios y la satisfacción de huéspedes es nuestra mejor carta de presentación.
                    </p>
                </div>

                <div className="grid md:grid-cols-3 gap-8 mb-16">
                    {testimonials.map((t) => (
                        <div key={t.id} className="bg-white p-8 rounded-lg shadow-sm hover:shadow-md transition-shadow">
                            <div className="flex items-center gap-4 mb-6">
                                <img
                                    src={t.avatar}
                                    alt={t.name}
                                    className="w-12 h-12 rounded-full object-cover border border-gray-100"
                                />
                                <div>
                                    <h4 className="font-bold text-gray-900">{t.name}</h4>
                                    <p className="text-sm text-primary">{t.role}</p>
                                </div>
                            </div>
                            <p className="text-gray-600 italic mb-6">"{t.text}"</p>
                            <div className="flex text-secondary gap-1">
                                {[...Array(t.stars)].map((_, i) => (
                                    <Star key={i} size={16} fill="currentColor" />
                                ))}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Metrics */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-8 text-center bg-primary text-white py-12 rounded-xl">
                    <div className="p-4">
                        <h3 className="text-4xl font-bold mb-2">+85%</h3>
                        <p className="opacity-80 text-sm uppercase tracking-wide">Ocupación Promedio</p>
                    </div>
                    <div className="p-4">
                        <h3 className="text-4xl font-bold mb-2">4.92</h3>
                        <p className="opacity-80 text-sm uppercase tracking-wide">Rating Promedio</p>
                    </div>
                    <div className="p-4 col-span-2 md:col-span-1">
                        <h3 className="text-4xl font-bold mb-2">+500</h3>
                        <p className="opacity-80 text-sm uppercase tracking-wide">Reservas Gestionadas</p>
                    </div>
                </div>
            </div>
        </section>
    );
};

export default Testimonials;
