import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}

export const Button: React.FC<ButtonProps> = ({
  className = '',
  variant = 'default',
  size = 'md',
  ...props
}) => {
  return (
    <button
      className={`inline-flex items-center justify-center rounded-md font-medium transition-colors
        ${variant === 'default' ? 'bg-primary text-primary-foreground hover:bg-primary/90' :
          variant === 'outline' ? 'border border-input bg-background hover:bg-accent hover:text-accent-foreground' :
          'hover:bg-accent hover:text-accent-foreground'}
        ${size === 'sm' ? 'h-9 px-3 text-xs' :
          size === 'lg' ? 'h-11 px-8 text-lg' :
          'h-10 px-4 py-2 text-sm'}
        ${className}`}
      {...props}
    />
  );
};
