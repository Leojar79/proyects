import React, { useState, useEffect } from 'react';
import { Menu, X } from 'lucide-react';

const Header = () => {
    const [isScrolled, setIsScrolled] = useState(false);
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    useEffect(() => {
        const handleScroll = () => {
            setIsScrolled(window.scrollY > 50);
        };
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    const navLinks = [
        { name: 'Inicio', href: '#hero' },
        { name: 'Propiedades', href: '#properties' },
        { name: 'Servicios', href: '#services' },
        { name: 'Cómo funciona', href: '#how' },
        { name: 'Testimonios', href: '#testimonials' },
        { name: 'FAQ', href: '#faq' },
        { name: 'Contacto', href: '#contact' },
    ];

    return (
        <header className={`header ${isScrolled ? 'header-scrolled' : ''}`}>
            <div className="container header-container">
                <a href="#hero" className="logo">
                    AireStay<span>.</span>
                </a>

                {/* Desktop Menu */}
                <nav className="desktop-nav">
                    {navLinks.map((link) => (
                        <a key={link.name} href={link.href} className="nav-link">
                            {link.name}
                        </a>
                    ))}
                    <a href="#contact" className="btn btn-primary">
                        Quiero publicar
                    </a>
                </nav>

                {/* Mobile Menu Button */}
                <button
                    className="mobile-menu-btn"
                    onClick={() => setIsMenuOpen(!isMenuOpen)}
                    aria-label="Menu"
                >
                    {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
                </button>

                {/* Mobile Menu Dropdown */}
                {isMenuOpen && (
                    <div className="mobile-menu animate-fade-in">
                        {navLinks.map((link) => (
                            <a
                                key={link.name}
                                href={link.href}
                                className="mobile-nav-link"
                                onClick={() => setIsMenuOpen(false)}
                            >
                                {link.name}
                            </a>
                        ))}
                        <a
                            href="#contact"
                            className="btn btn-primary"
                            onClick={() => setIsMenuOpen(false)}
                        >
                            Publicar mi inmueble
                        </a>
                    </div>
                )}
            </div>
        </header>
    );
};

export default Header;
