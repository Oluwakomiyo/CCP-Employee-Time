import React from 'react';

interface CcpLogoProps {
  className?: string;
  size?: number;
  showText?: boolean;
}

export const CcpLogo: React.FC<CcpLogoProps> = ({
  className = '',
  size = 40,
  showText = true,
}) => {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {/* Faceted Globe SVG geometry based on CCP logo */}
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0"
      >
        {/* Facet clusters shaded from maroon (#88232A) to crimson (#D71A21) */}
        <path d="M50 10 C 65 10, 85 25, 88 45 L 75 42 L 68 28 Z" fill="#D71A21" />
        <path d="M88 48 C 88 68, 72 88, 52 92 L 56 78 L 74 72 Z" fill="#BA171D" />
        <path d="M48 92 C 30 90, 18 78, 14 62 L 28 62 L 36 78 Z" fill="#88232A" />
        <path d="M14 58 C 12 40, 24 22, 40 14 L 42 28 L 26 38 Z" fill="#6E1B21" />
        {/* Center-right grid facets */}
        <polygon points="50,26 64,30 58,46 44,42" fill="#E84E54" />
        <polygon points="66,32 78,44 72,58 60,48" fill="#D71A21" />
        <polygon points="46,44 58,48 52,64 40,60" fill="#D71A21" />
        <polygon points="60,50 72,60 64,74 52,66" fill="#88232A" />
        <polygon points="34,40 44,44 38,58 28,54" fill="#88232A" />
        <polygon points="40,62 50,66 44,78 34,74" fill="#6E1B21" />
      </svg>

      {showText && (
        <div className="flex flex-col leading-none">
          <span className="font-extrabold tracking-wider text-ccp-700 text-2xl font-sans">
            CCP
          </span>
          <span className="text-[10px] tracking-widest text-slate-500 uppercase font-semibold">
            Time Systems
          </span>
        </div>
      )}
    </div>
  );
};