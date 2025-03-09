import React, { useState } from 'react';

interface TooltipProps {
  children: React.ReactNode;
  content: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

export const Tooltip: React.FC<TooltipProps> = ({
  children,
  content,
  position = 'top'
}) => {
  const [show, setShow] = useState(false);

  return (
    <div className="relative inline-block">
      <div
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
      >
        {children}
      </div>
      {show && (
        <div
          className={`absolute z-50 px-2 py-1 text-sm text-white bg-black rounded shadow-lg
            ${position === 'top' ? 'bottom-full left-1/2 -translate-x-1/2 mb-2' :
              position === 'bottom' ? 'top-full left-1/2 -translate-x-1/2 mt-2' :
              position === 'left' ? 'right-full top-1/2 -translate-y-1/2 mr-2' :
              'left-full top-1/2 -translate-y-1/2 ml-2'}
          `}
        >
          {content}
        </div>
      )}
    </div>
  );
};
