"use client";

/**
 * Signature capture on a canvas (touch, pen and mouse via Pointer Events). Exports a PNG blob.
 * High-DPI aware; "Clear" resets; an accessible fallback (typed name) is required separately by the flow.
 */
import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { Eraser } from "lucide-react";

export type SignaturePadHandle = { toBlob: () => Promise<Blob | null>; clear: () => void; isEmpty: () => boolean };

export function SignaturePad({ ref, label = "Recipient signature", onChange }: { ref?: Ref<SignaturePadHandle>; label?: string; onChange?: (empty: boolean) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [empty, setEmpty] = useState(true);
  // Keep the latest callback in a ref so parent re-renders never re-initialize (and erase) the pad
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const emptyRef = useRef(true);

  const setup = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ratio = Math.max(1, window.devicePixelRatio || 1);
    const { width, height } = c.getBoundingClientRect();
    c.width = Math.round(width * ratio);
    c.height = Math.round(height * ratio);
    const ctx = c.getContext("2d")!;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.6;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#00142d";
    emptyRef.current = true;
    setEmpty(true);
    onChangeRef.current?.(true);
  }, []);

  // Initialize once on mount; re-initialize only when the canvas width really changes (rotation)
  useEffect(() => {
    setup();
    const c = canvasRef.current;
    let lastWidth = c?.getBoundingClientRect().width ?? 0;
    const onResize = () => {
      const w = canvasRef.current?.getBoundingClientRect().width ?? 0;
      if (Math.abs(w - lastWidth) > 2 && emptyRef.current) {
        lastWidth = w;
        setup();
      }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [setup]);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = point(e);
    const ctx = e.currentTarget.getContext("2d")!;
    ctx.beginPath();
    ctx.arc(last.current.x, last.current.y, 1.2, 0, Math.PI * 2);
    ctx.fillStyle = "#00142d";
    ctx.fill();
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || !last.current) return;
    const p = point(e);
    const ctx = e.currentTarget.getContext("2d")!;
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    if (emptyRef.current) {
      emptyRef.current = false;
      setEmpty(false);
      onChangeRef.current?.(false);
    }
  };
  const up = () => {
    drawing.current = false;
    last.current = null;
  };

  useImperativeHandle(ref, () => ({
    clear: setup,
    isEmpty: () => emptyRef.current,
    toBlob: () =>
      new Promise((resolve) => {
        const c = canvasRef.current;
        if (!c || emptyRef.current) return resolve(null);
        // White background so the signature is readable in PDFs and dark viewers
        const out = document.createElement("canvas");
        out.width = c.width;
        out.height = c.height;
        const ctx = out.getContext("2d")!;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, out.width, out.height);
        ctx.drawImage(c, 0, 0);
        out.toBlob((b) => resolve(b), "image/png");
      }),
  }));

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold text-navy">{label}</p>
        <button type="button" onClick={setup} className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-orange-700 active:bg-orange-50">
          <Eraser className="h-4 w-4" aria-hidden /> Clear
        </button>
      </div>
      <canvas
        ref={canvasRef}
        data-testid="signature-canvas"
        aria-label={`${label}: sign inside the box with your finger`}
        role="img"
        className="h-44 w-full touch-none rounded-2xl border-2 border-dashed border-navy/30 bg-white"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onPointerLeave={up}
      />
      <p className="mt-1.5 text-xs text-slate-ink">{empty ? "Ask the recipient to sign inside the box." : "Signature captured."}</p>
    </div>
  );
}
