"use client";

/**
 * Piece scanner: camera QR scanning via the BarcodeDetector API where the browser supports it
 * (Chrome on Android), with a manual entry field that always works (and is the fallback on iPhone).
 * Bag tags carry the piece ID, e.g. EB-261015-7K3P-01.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CameraOff, Keyboard } from "lucide-react";

type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };
type DetectorCtor = new (opts: { formats: string[] }) => Detector;

export function Scanner({ onCode, busy, placeholder = "EB-261015-7K3P-01" }: { onCode: (code: string) => void; busy?: boolean; placeholder?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastCode = useRef<{ code: string; at: number } | null>(null);
  const [supported, setSupported] = useState(false);
  const [active, setActive] = useState(false);
  const [camError, setCamError] = useState<string | null>(null);
  const [manual, setManual] = useState("");

  useEffect(() => {
    setSupported(typeof window !== "undefined" && "BarcodeDetector" in window && !!navigator.mediaDevices?.getUserMedia);
  }, []);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setActive(false);
  }, []);

  useEffect(() => stop, [stop]);

  const start = async () => {
    setCamError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      streamRef.current = stream;
      setActive(true);
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();
      const Ctor = (window as unknown as { BarcodeDetector: DetectorCtor }).BarcodeDetector;
      const detector = new Ctor({ formats: ["qr_code", "code_128", "code_39", "data_matrix"] });
      const tick = async () => {
        if (!streamRef.current) return;
        try {
          const codes = await detector.detect(video);
          const raw = codes[0]?.rawValue?.trim();
          // Ignore the same tag for 2.5 s so one bag is not scanned repeatedly
          if (raw && !(lastCode.current?.code === raw && Date.now() - lastCode.current.at < 2500)) {
            lastCode.current = { code: raw, at: Date.now() };
            onCode(raw);
          }
        } catch {
          /* frame not ready */
        }
        if (streamRef.current) requestAnimationFrame(() => void tick());
      };
      void tick();
    } catch {
      stop();
      setCamError("Camera unavailable. Allow camera access in your browser settings, or type the tag below.");
    }
  };

  const submitManual = (e: React.FormEvent) => {
    e.preventDefault();
    const v = manual.trim();
    if (!v) return;
    onCode(v);
    setManual("");
  };

  return (
    <div className="space-y-3">
      {supported && (
        <div className="overflow-hidden rounded-2xl bg-navy-950">
          <div className={`relative ${active ? "block" : "hidden"}`}>
            <video ref={videoRef} playsInline muted className="aspect-[4/3] w-full object-cover" aria-label="Camera view for scanning bag tags" />
            <div aria-hidden className="pointer-events-none absolute inset-x-[20%] inset-y-[22%] rounded-xl border-4 border-orange/90 shadow-[0_0_0_999px_rgb(0_20_45/0.35)]" />
          </div>
          <button
            type="button"
            onClick={active ? stop : start}
            className="flex min-h-14 w-full items-center justify-center gap-2 bg-navy px-4 text-base font-bold text-white active:bg-navy-700"
          >
            {active ? <CameraOff className="h-5 w-5" aria-hidden /> : <Camera className="h-5 w-5" aria-hidden />}
            {active ? "Stop camera" : "Scan bag tags with camera"}
          </button>
        </div>
      )}
      {camError && <p role="alert" className="rounded-xl bg-orange-50 p-3 text-sm text-orange-700">{camError}</p>}
      <form onSubmit={submitManual} className="flex gap-2">
        <label htmlFor="manual-code" className="sr-only">Type a bag tag ID</label>
        <div className="relative flex-1">
          <Keyboard className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" aria-hidden />
          <input
            id="manual-code"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder={placeholder}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            inputMode="text"
            className="min-h-14 w-full rounded-2xl border-2 border-line bg-white pl-11 pr-3 font-mono text-base uppercase tracking-wide text-charcoal focus:border-navy focus:outline-none"
          />
        </div>
        <button type="submit" disabled={busy || !manual.trim()} className="min-h-14 rounded-2xl bg-orange-600 px-5 text-base font-bold text-white disabled:opacity-50">
          Add
        </button>
      </form>
    </div>
  );
}
