import React, { useEffect } from 'react';

interface Props {
  src: string;
  alt: string;
  onClose: () => void;
}

export const ImageLightbox: React.FC<Props> = ({ src, alt, onClose }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="cgi-lightbox-overlay" onClick={onClose}>
      <button className="cgi-lightbox-close" onClick={onClose} title="Close (Esc)">✕</button>
      <img
        src={src}
        alt={alt}
        className="cgi-lightbox-img"
        onClick={e => e.stopPropagation()}
      />
    </div>
  );
};
