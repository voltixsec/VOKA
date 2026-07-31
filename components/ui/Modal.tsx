"use client";

import type { ReactNode } from "react";

import { Button } from "./Button";

interface ModalProps {
  open: boolean;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
}

export function Modal({
  open,
  title,
  description,
  children,
  footer,
  onClose,
}: ModalProps) {
  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="voka-modal-title"
      onMouseDown={onClose}
    >
      <div
        className="w-full max-w-xl rounded-3xl border border-white/10 bg-slate-900 shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-6 py-5">
          <div>
            <h2
              id="voka-modal-title"
              className="text-xl font-semibold text-white"
            >
              {title}
            </h2>

            {description && (
              <p className="mt-1 text-sm text-slate-400">
                {description}
              </p>
            )}
          </div>

          <Button
            variant="ghost"
            size="sm"
            aria-label="Close modal"
            onClick={onClose}
          >
            ✕
          </Button>
        </div>

        <div className="p-6">
          {children}
        </div>

        {footer && (
          <div className="flex justify-end gap-3 border-t border-white/10 px-6 py-5">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
