import { X } from "lucide-react";

/** X button that closes a side detail panel. Hidden when printing. */
export default function PanelCloseButton({ onClick, label = "Đóng", size = 20, className = "" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title="Đóng"
      className={`shrink-0 rounded-lg p-1 text-gray-500 transition hover:bg-gray-100 hover:text-gray-800 print:hidden ${className}`}
    >
      <X size={size} />
    </button>
  );
}
