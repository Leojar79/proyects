import React, { useState } from 'react';
import Button from '../common/Button';
import { Mail, Phone, MapPin, Send } from 'lucide-react';

const Contact = () => {
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        phone: '',
        role: 'owner',
        city: '',
        propertyType: '',
        rooms: '',
        message: '',
        privacy: false
    });
    const [isSuccess, setIsSuccess] = useState(false);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (formData.privacy) {
            try {
                const response = await fetch('https://leojar.app.n8n.cloud/webhook/b9ea3d83-eb4d-4728-95bf-75d8d6ca403f', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(formData)
                });

                if (response.ok) {
                    setIsSuccess(true);
                    setFormData({
                        name: '',
                        email: '',
                        phone: '',
                        role: 'owner',
                        city: '',
                        propertyType: '',
                        rooms: '',
                        message: '',
                        privacy: false
                    });
                } else {
                    alert('Hubo un error al enviar el formulario. Por favor intenta nuevamente.');
                }
            } catch (error) {
                console.error('Error submitting form:', error);
                alert('Hubo un error de conexión. Por favor intenta nuevamente.');
            }
        } else {
            alert('Por favor acepta la política de privacidad para continuar.');
        }
    };

    return (
        <section id="contact" className="section bg-light">
            <div className="container max-w-6xl mx-auto">
                <div className="grid md:grid-cols-2 gap-12 bg-white rounded-2xl shadow-xl overflow-hidden animate-fade-in">

                    {/* Contact Info Side */}
                    <div className="bg-primary text-white p-12 flex flex-col justify-between relative">
                        <div className="absolute inset-0 bg-secondary opacity-10 pattern-dots"></div> {/* Placeholder pattern */}
                        <div className="relative z-10">
                            <h2 className="text-4xl font-display font-bold mb-6">Hablemos de tu propiedad</h2>
                            <p className="text-neutral-200 mb-8 max-w-sm leading-relaxed">
                                Descubre cuánto puedes ganar con nuestra gestión experta. Asesoría gratuita y sin compromiso.
                            </p>

                            <div className="space-y-6">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-secondary/20 rounded-full flex items-center justify-center text-secondary">
                                        <Phone size={24} />
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-sm uppercase tracking-wider opacity-70">Llámanos</h4>
                                        <p className="text-lg">+57 316 531 8861</p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-secondary/20 rounded-full flex items-center justify-center text-secondary">
                                        <Mail size={24} />
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-sm uppercase tracking-wider opacity-70">Email</h4>
                                        <p className="text-lg">hello@airestay.com</p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-secondary/20 rounded-full flex items-center justify-center text-secondary">
                                        <MapPin size={24} />
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-sm uppercase tracking-wider opacity-70">Oficinas</h4>
                                        <p className="text-lg">Av. Reforma 222, CDMX</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="relative z-10 mt-12">
                            <p className="text-sm opacity-60">© 2024 AireStay Rentals. Todos los derechos reservados.</p>
                        </div>
                    </div>

                    {/* Form Side */}
                    <div className="p-8 md:p-12 relative">
                        {isSuccess ? (
                            <div className="h-full flex flex-col justify-center items-center text-center animate-fade-in">
                                <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center text-green-600 mb-6">
                                    <Send size={40} />
                                </div>
                                <h3 className="text-3xl font-bold text-gray-800 mb-2">¡Mensaje Enviado!</h3>
                                <p className="text-gray-500 mb-8 max-w-xs">
                                    Gracias por contactarnos. Te hemos redirigido a WhatsApp para continuar la conversación.
                                </p>
                                <Button onClick={() => setIsSuccess(false)} variant="outline">
                                    Enviar otro mensaje
                                </Button>
                            </div>
                        ) : (
                            <form onSubmit={handleSubmit} className="space-y-6">
                                <div className="grid md:grid-cols-2 gap-6">
                                    <div className="form-group">
                                        <label className="form-label text-sm uppercase text-gray-400 font-bold mb-2 tracking-wide">Nombre completo</label>
                                        <input
                                            type="text"
                                            name="name"
                                            value={formData.name}
                                            onChange={handleChange}
                                            required
                                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
                                            placeholder="Juan Pérez"
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label text-sm uppercase text-gray-400 font-bold mb-2 tracking-wide">Email</label>
                                        <input
                                            type="email"
                                            name="email"
                                            value={formData.email}
                                            onChange={handleChange}
                                            required
                                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
                                            placeholder="juan@email.com"
                                        />
                                    </div>
                                </div>

                                <div className="grid md:grid-cols-2 gap-6">
                                    <div className="form-group">
                                        <label className="form-label text-sm uppercase text-gray-400 font-bold mb-2 tracking-wide">Teléfono</label>
                                        <input
                                            type="tel"
                                            name="phone"
                                            value={formData.phone}
                                            onChange={handleChange}
                                            required
                                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
                                            placeholder="+52 55..."
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label text-sm uppercase text-gray-400 font-bold mb-2 tracking-wide">Soy</label>
                                        <select
                                            name="role"
                                            value={formData.role}
                                            onChange={handleChange}
                                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all appearance-none"
                                        >
                                            <option value="owner">Dueño de inmueble</option>
                                            <option value="guest">Huésped</option>
                                            <option value="investor">Inversionista</option>
                                        </select>
                                    </div>
                                </div>

                                {formData.role === 'owner' && (
                                    <div className="grid md:grid-cols-3 gap-4 animate-fade-in">
                                        <input
                                            type="text"
                                            name="city"
                                            placeholder="Ciudad / Zona"
                                            value={formData.city}
                                            onChange={handleChange}
                                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary outline-none"
                                        />
                                        <select
                                            name="propertyType"
                                            value={formData.propertyType}
                                            onChange={handleChange}
                                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary outline-none"
                                        >
                                            <option value="">Tipo</option>
                                            <option value="apartment">Apto</option>
                                            <option value="house">Casa</option>
                                            <option value="studio">Studio</option>
                                        </select>
                                        <select
                                            name="rooms"
                                            value={formData.rooms}
                                            onChange={handleChange}
                                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary outline-none"
                                        >
                                            <option value="">Habs</option>
                                            <option value="1">1</option>
                                            <option value="2">2</option>
                                            <option value="3">3</option>
                                            <option value="4+">4+</option>
                                        </select>
                                    </div>
                                )}

                                <div className="form-group">
                                    <label className="form-label text-sm uppercase text-gray-400 font-bold mb-2 tracking-wide">Mensaje</label>
                                    <textarea
                                        name="message"
                                        value={formData.message}
                                        onChange={handleChange}
                                        rows="4"
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all resize-none"
                                        placeholder="Cuéntanos más sobre cómo podemos ayudarte..."
                                    ></textarea>
                                </div>

                                <div className="flex items-center gap-3">
                                    <input
                                        type="checkbox"
                                        name="privacy"
                                        checked={formData.privacy}
                                        onChange={handleChange}
                                        id="privacy"
                                        className="w-5 h-5 text-primary rounded border-gray-300 focus:ring-primary"
                                    />
                                    <label htmlFor="privacy" className="text-sm text-gray-500 cursor-pointer select-none">
                                        He leído y acepto la <a href="#" className="underline text-primary">política de privacidad</a>.
                                    </label>
                                </div>

                                <Button type="submit" variant="primary" fullWidth className="mt-4 py-4 text-lg shadow-lg hover:shadow-xl">
                                    Enviar y recibir asesoría
                                </Button>
                            </form>
                        )}
                    </div>
                </div>
            </div>
        </section >
    );
};

export default Contact;
