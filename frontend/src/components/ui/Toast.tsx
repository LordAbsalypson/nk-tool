import type { ComponentType, SVGProps } from "react";
import {
  CheckCircleIcon,
  ExclamationCircleIcon,
  InformationCircleIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import type { Toast, ToastType } from "../../hooks/useToast";

const styles: Record<ToastType, string> = {
  success: "bg-green-50 border-green-400 text-green-800",
  error: "bg-red-50 border-red-400 text-red-800",
  info: "bg-blue-50 border-blue-400 text-blue-800",
};

const icons: Record<ToastType, ComponentType<SVGProps<SVGSVGElement>>> = {
  success: CheckCircleIcon,
  error: ExclamationCircleIcon,
  info: InformationCircleIcon,
};

interface ToastListProps {
  toasts: Toast[];
  onRemove: (id: number) => void;
}

export function ToastList({ toasts, onRemove }: ToastListProps) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((t) => {
        const Icon = icons[t.type];
        return (
          <div
            key={t.id}
            className={`flex items-start gap-2 px-4 py-3 rounded-lg border shadow-md text-sm ${styles[t.type]}`}
          >
            <Icon className="w-5 h-5 shrink-0 mt-0.5" />
            <span className="flex-1">{t.message}</span>
            <button
              onClick={() => onRemove(t.id)}
              className="ml-2 opacity-60 hover:opacity-100"
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
