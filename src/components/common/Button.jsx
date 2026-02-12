import React from 'react';

const Button = ({
    children,
    variant = 'primary',
    className = '',
    onClick,
    type = 'button',
    fullWidth = false,
    href = ''
}) => {
    const baseStyles = 'btn';
    const variantStyles = {
        primary: 'btn-primary',
        secondary: 'btn-secondary',
        outline: 'btn-outline',
    };

    const widthStyle = fullWidth ? 'w-full' : '';
    const combinedClasses = `${baseStyles} ${variantStyles[variant]} ${widthStyle} ${className}`;

    if (href) {
        return (
            <a href={href} className={combinedClasses} onClick={onClick}>
                {children}
            </a>
        );
    }

    return (
        <button
            type={type}
            className={combinedClasses}
            onClick={onClick}
        >
            {children}
        </button>
    );
};

export default Button;
