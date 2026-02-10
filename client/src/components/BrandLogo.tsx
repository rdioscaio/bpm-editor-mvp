import React from 'react';

interface BrandLogoProps {
  onClick?: () => void;
  className?: string;
  title?: string;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  onClick,
  className = 'h-7 w-auto',
  title = 'Ir para a Biblioteca',
}) => {
  const logo = <img src="/brand/tottal-logo.svg" alt="TOTTAL BPM" className={className} />;

  if (!onClick) {
    return <span className="brand-logo">{logo}</span>;
  }

  return (
    <button type="button" onClick={onClick} title={title} aria-label={title} className="brand-logo brand-logo-button">
      {logo}
    </button>
  );
};
