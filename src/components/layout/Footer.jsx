import React from 'react';
import { Facebook, Instagram, Linkedin, Mail, Phone, MapPin } from 'lucide-react';

const Footer = () => {
    return (
        <footer className="bg-primary text-white pt-16 pb-8">
            <div className="container">
                <div className="grid md:grid-cols-4 gap-12 mb-12">
                    <div className="col-span-1 md:col-span-1">
                        <a href="#hero" className="text-3xl font-bold font-display text-white mb-6 block">
                            AireStay<span className="text-secondary">.</span>
                        </a>
                        <p className="text-gray-400 mb-6">
                            Gestión profesional de rentas cortas. Maximizamos tus ingresos, cuidamos tu patrimonio.
                        </p>
                        <div className="flex gap-4">
                            <a href="#" className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center hover:bg-secondary transition-colors text-white">
                                <Facebook size={20} />
                            </a>
                            <a href="#" className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center hover:bg-secondary transition-colors text-white">
                                <Instagram size={20} />
                            </a>
                            <a href="#" className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center hover:bg-secondary transition-colors text-white">
                                <Linkedin size={20} />
                            </a>
                        </div>
                    </div>

                    <div>
                        <h4 className="text-lg font-bold mb-6">Enlaces Rápidos</h4>
                        <ul className="space-y-3">
                            <li><a href="#properties" className="text-gray-400 hover:text-white transition-colors">Propiedades</a></li>
                            <li><a href="#services" className="text-gray-400 hover:text-white transition-colors">Servicios</a></li>
                            <li><a href="#how" className="text-gray-400 hover:text-white transition-colors">Cómo funciona</a></li>
                            <li><a href="#testimonials" className="text-gray-400 hover:text-white transition-colors">Testimonios</a></li>
                            <li><a href="#contact" className="text-gray-400 hover:text-white transition-colors">Contacto</a></li>
                        </ul>
                    </div>

                    <div>
                        <h4 className="text-lg font-bold mb-6">Legal</h4>
                        <ul className="space-y-3">
                            <li><a href="#" className="text-gray-400 hover:text-white transition-colors">Términos y Condiciones</a></li>
                            <li><a href="#" className="text-gray-400 hover:text-white transition-colors">Política de Privacidad</a></li>
                            <li><a href="#" className="text-gray-400 hover:text-white transition-colors">Aviso Legal</a></li>
                            <li><a href="#" className="text-gray-400 hover:text-white transition-colors">Cookies</a></li>
                        </ul>
                    </div>

                    <div>
                        <h4 className="text-lg font-bold mb-6">Contacto</h4>
                        <ul className="space-y-4">
                            <li className="flex items-start gap-3 text-gray-400">
                                <MapPin size={20} className="text-secondary mt-1 shrink-0" />
                                <span>Av. Reforma 222, Colonia Juárez, 06600 Ciudad de México, CDMX</span>
                            </li>
                            <li className="flex items-center gap-3 text-gray-400">
                                <Phone size={20} className="text-secondary shrink-0" />
                                <span>+52 (55) 1234 5678</span>
                            </li>
                            <li className="flex items-center gap-3 text-gray-400">
                                <Mail size={20} className="text-secondary shrink-0" />
                                <span>contacto@airestay.com</span>
                            </li>
                        </ul>
                    </div>
                </div>

                <div className="border-t border-gray-700 pt-8 flex flex-col md:flex-row justify-between items-center text-gray-500 text-sm">
                    <p>© 2024 AireStay Rentals. Todos los derechos reservados.</p>
                    <p className="mt-2 md:mt-0">Diseñado para convertir.</p>
                </div>
            </div>
        </footer>
    );
};

export default Footer;
