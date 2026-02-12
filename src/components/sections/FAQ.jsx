import React, { useState } from 'react';
import { faqItems } from '../../data/mockData';
import { Plus, Minus } from 'lucide-react';

const FAQItem = ({ question, answer }) => {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className="border-b border-gray-200">
            <button
                className="w-full flex justify-between items-center py-4 text-left font-medium text-gray-900 hover:text-primary transition-colors focus:outline-none"
                onClick={() => setIsOpen(!isOpen)}
            >
                <span>{question}</span>
                {isOpen ? <Minus size={20} className="text-secondary" /> : <Plus size={20} className="text-gray-400" />}
            </button>
            <div
                className={`overflow-hidden transition-all duration-300 ${isOpen ? 'max-h-96 pb-4 opacity-100' : 'max-h-0 opacity-0'}`}
            >
                <p className="text-gray-600 leading-relaxed pr-8">{answer}</p>
            </div>
        </div>
    );
};

const FAQ = () => {
    return (
        <section id="faq" className="section bg-layout">
            <div className="container max-w-4xl mx-auto">
                <div className="text-center mb-12 animate-fade-in">
                    <h2 className="text-3xl font-display font-bold text-primary mb-4">Preguntas Frecuentes</h2>
                    <p className="text-gray-500">Resolvemos tus dudas sobre la gestión de rentas cortas.</p>
                </div>

                <div className="bg-white rounded-xl shadow-sm p-6 md:p-8 animate-fade-in">
                    {faqItems.map((item, index) => (
                        <FAQItem key={index} {...item} />
                    ))}
                </div>
            </div>
        </section>
    );
};

export default FAQ;
