'use client';

import { useRef, useState, type InputHTMLAttributes } from 'react';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange'> & {
  isArabic: boolean;
  label: string;
  onFile: (file: File | undefined) => void;
};

export function LocalizedFileInput({ isArabic, label, onFile, ...props }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  return (
    <label className="block text-sm text-slate-300">
      <span className="block">{label}</span>
      <input
        {...props}
        ref={inputRef}
        type="file"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          setFileName(file?.name ?? '');
          onFile(file);
        }}
      />
      <span className="mt-2 flex min-h-11 items-center gap-3 rounded-xl border border-white/10 bg-slate-950 px-3">
        <button
          type="button"
          className="rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white"
          onClick={() => inputRef.current?.click()}
        >
          {isArabic ? 'اختيار ملف' : 'Choose file'}
        </button>
        <span className="truncate text-xs text-slate-400">
          {fileName || (isArabic ? 'لم يتم اختيار ملف' : 'No file selected')}
        </span>
      </span>
    </label>
  );
}
