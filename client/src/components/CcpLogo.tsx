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
    <div className={`flex items-center gap-2 ${className}`}>
      {/* 🔴 Your local image file from client/public/ccp-logo.png */}
      <img
        src="/ccp-logo.png"
        alt="CCP Logo"
        style={{ width: size, height: size }}
        className="shrink-0 object-contain"
      />

      {showText && (
        <div className="flex flex-col leading-none">
          <span className="font-bold tracking-wider text-ccp-700 text-xl font-sans">
            CCP
          </span>
          <span className="text-[9px] tracking-widest text-slate-400 uppercase font-bold">
            Time Systems
          </span>
        </div>
      )}
    </div>
  );
};