import React, { useState } from 'react';
import { properties } from '../../data/mockData';
import Modal from '../common/Modal';
import Button from '../common/Button';
import { MapPin, Users, Check } from 'lucide-react';

const PropertyCard = ({ property, onSelect }) => {
    return (
        <div className="card">
            <div className="card-image-container">
                <img src={property.image} alt={property.name} className="card-image" loading="lazy" />
                <span className="price-tag">${property.price}/noche</span>
            </div>
            <div className="card-content">
                <h3 className="card-title font-bold text-lg">{property.name}</h3>
                <div className="card-location">
                    <MapPin size={16} /> {property.location}
                </div>
                <div className="card-meta">
                    <span><Users size={16} className="inline mr-1" /> {property.capacity} Huéspedes</span>
                </div>
                <Button variant="outline" fullWidth onClick={() => onSelect(property)}>
                    Ver detalles
                </Button>
            </div>
        </div>
    );
};

const PropertyDetails = ({ property }) => {
    if (!property) return null;
    return (
        <div className="grid md:grid-cols-2 gap-8 md:p-8 p-4">
            <div className="property-gallery">
                <img src={property.image} alt={property.name} className="w-full h-80 object-cover rounded-lg shadow-md mb-4" />
                <div className="grid grid-cols-3 gap-2">
                    {/* Mock Gallery Thumbs */}
                    <img src={property.image} className="w-full h-24 object-cover rounded" alt="thumb" />
                    <img src={property.image} className="w-full h-24 object-cover rounded grayscale hover:grayscale-0 transition-all" alt="thumb" />
                    <img src={property.image} className="w-full h-24 object-cover rounded grayscale hover:grayscale-0 transition-all" alt="thumb" />
                </div>
            </div>

            <div className="property-info flex flex-col h-full">
                <div>
                    <h2 className="text-3xl font-bold font-display mb-2">{property.name}</h2>
                    <div className="flex items-center text-gray-500 mb-4">
                        <MapPin size={18} className="mr-1" /> {property.location}
                    </div>

                    <div className="flex gap-4 mb-6 text-sm">
                        <span className="bg-neutral px-3 py-1 rounded-full text-primary font-medium">{property.capacity} Huéspedes</span>
                        <span className="bg-neutral px-3 py-1 rounded-full text-primary font-medium">Wifi</span>
                        <span className="bg-neutral px-3 py-1 rounded-full text-primary font-medium">Cocina</span>
                    </div>

                    <p className="text-gray-600 mb-6 leading-relaxed">
                        {property.description}
                    </p>

                    <h3 className="font-bold mb-3">Amenidades</h3>
                    <ul className="grid grid-cols-2 gap-y-2 mb-8">
                        {property.amenities.map((amenity, idx) => (
                            <li key={idx} className="flex items-center text-sm text-gray-600">
                                <Check size={16} className="text-secondary mr-2" /> {amenity}
                            </li>
                        ))}
                    </ul>
                </div>

                <div className="mt-auto border-t pt-6 flex justify-between items-center">
                    <div>
                        <span className="text-2xl font-bold text-primary">${property.price}</span>
                        <span className="text-gray-500 text-sm"> / noche</span>
                    </div>
                    <Button href="#contact" variant="primary">
                        Consultar disponibilidad
                    </Button>
                </div>
            </div>
        </div>
    );
};

const Properties = () => {
    const [selectedProperty, setSelectedProperty] = useState(null);

    return (
        <section id="properties" className="section bg-layout"> {/* layout bg usually gray or white */}
            <div className="container">
                <div className="text-center mb-12 animate-fade-in">
                    <h2 className="text-4xl font-display font-bold text-primary mb-4">Propiedades Destacadas</h2>
                    <p className="text-gray-600 max-w-2xl mx-auto">
                        Explora nuestra selección de inmuebles premium, diseñados para brindarte la mejor experiencia de hospedaje.
                    </p>
                </div>

                <div className="property-grid">
                    {properties.map((prop) => (
                        <PropertyCard key={prop.id} property={prop} onSelect={setSelectedProperty} />
                    ))}
                </div>
            </div>

            <Modal isOpen={!!selectedProperty} onClose={() => setSelectedProperty(null)}>
                {selectedProperty && <PropertyDetails property={selectedProperty} />}
            </Modal>
        </section>
    );
};

export default Properties;
