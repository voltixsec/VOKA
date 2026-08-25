"use client";

import { useEffect, useRef, useState } from "react";

export function SignaturePad({ isArabic, onAccept }: { isArabic: boolean; onAccept: (dataUrl: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = Math.max(1, window.devicePixelRatio || 1);
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const context = canvas.getContext("2d");
    context?.scale(ratio, ratio);
    if (context) { context.strokeStyle = "#0f172a"; context.lineWidth = 2.2; context.lineCap = "round"; context.lineJoin = "round"; }
  }, []);

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const start = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId); drawing.current = true;
    const context = event.currentTarget.getContext("2d"); const p = point(event); context?.beginPath(); context?.moveTo(p.x, p.y);
  };
  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return; const context = event.currentTarget.getContext("2d"); const p = point(event); context?.lineTo(p.x, p.y); context?.stroke(); setHasInk(true);
  };
  const stop = () => { drawing.current = false; };
  const clear = () => { const canvas = canvasRef.current; canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height); setHasInk(false); };

  return <div className="rounded-2xl border border-slate-700 bg-white p-3">
    <canvas ref={canvasRef} aria-label={isArabic ? "لوحة رسم التوقيع" : "Signature drawing pad"} className="h-40 w-full touch-none rounded-lg" onPointerDown={start} onPointerMove={move} onPointerUp={stop} onPointerCancel={stop} />
    <div className="mt-3 flex gap-2">
      <button type="button" onClick={clear} className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800">{isArabic ? "مسح" : "Clear"}</button>
      <button type="button" disabled={!hasInk} onClick={() => { const value = canvasRef.current?.toDataURL("image/png"); if (value) onAccept(value); }} className="rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">{isArabic ? "استخدام التوقيع" : "Use signature"}</button>
    </div>
  </div>;
}
