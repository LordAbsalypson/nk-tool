import { useState } from "react";

interface TooltipProps {
  content: string;
}

export function Tooltip({ content }: TooltipProps) {
  const [visible, setVisible] = useState(false);

  return (
    <span className="relative inline-flex items-center">
      <button
        type="button"
        className="ml-1 w-4 h-4 rounded-full bg-gray-200 text-gray-500 text-xs font-bold leading-none hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-400 flex-shrink-0 inline-flex items-center justify-center"
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onFocus={() => setVisible(true)}
        onBlur={() => setVisible(false)}
        aria-label="Erklärung anzeigen"
      >
        ?
      </button>
      {visible && (
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 w-72 bg-gray-900 text-white text-xs rounded-lg px-3 py-2.5 shadow-xl leading-relaxed pointer-events-none">
          {content}
          <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
        </span>
      )}
    </span>
  );
}
