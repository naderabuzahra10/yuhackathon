import { useEffect, useRef, useState } from 'react';
import { CameraSlash } from '@phosphor-icons/react';
import { useI18n } from '@/lib/i18n';
import { Dialog } from './overlay';

/* Reads a QR code with the device camera. Uses the browser's own detector where it exists and
   loads a small decoder otherwise. A camera needs a secure page (https or localhost); when there
   is none, the dialog says so. The code can always be typed instead, in the field underneath. */

interface Detector {
  detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue: string }>>;
}

export function Scanner({ open, onClose, onRead, title, hint }: { open: boolean; onClose: () => void; onRead: (text: string) => void; title: string; hint?: string }) {
  const { t } = useI18n();
  const video = useRef<HTMLVideoElement>(null);
  const [problem, setProblem] = useState<'denied' | 'unavailable' | null>(null);
  const [typed, setTyped] = useState('');
  const read = useRef(onRead);
  read.current = onRead;

  useEffect(() => {
    if (!open) return;
    setProblem(null);
    setTyped('');
    let stopped = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    void (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('unavailable');
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        if (stopped) return stream.getTracks().forEach((track) => track.stop());
        const el = video.current;
        if (!el) return;
        el.srcObject = stream;
        await el.play().catch(() => undefined);

        const Native = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
        const native = Native ? new Native({ formats: ['qr_code'] }) : null;
        const decode = native ? null : (await import('jsqr')).default;
        const canvas = document.createElement('canvas');
        const frame = canvas.getContext('2d', { willReadFrequently: true });

        const tick = async () => {
          if (stopped) return;
          let text: string | null = null;
          if (el.readyState >= 2 && el.videoWidth) {
            if (native) text = (await native.detect(el).catch(() => []))[0]?.rawValue ?? null;
            else if (decode && frame) {
              const width = Math.min(640, el.videoWidth);
              const height = Math.round((width * el.videoHeight) / el.videoWidth);
              canvas.width = width;
              canvas.height = height;
              frame.drawImage(el, 0, 0, width, height);
              text = decode(frame.getImageData(0, 0, width, height).data, width, height)?.data || null;
            }
          }
          if (text && !stopped) {
            stopped = true;
            read.current(text);
            return;
          }
          timer = setTimeout(() => void tick(), 160);
        };
        void tick();
      } catch (e) {
        if (!stopped) setProblem((e as Error).name === 'NotAllowedError' ? 'denied' : 'unavailable');
      }
    })();

    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [open]);

  return (
    <Dialog open={open} onClose={onClose} title={title} subtitle={hint}>
      {problem ? (
        <div className="flex flex-col items-center px-4 py-6 text-center">
          <div className="mb-3 grid size-12 place-items-center rounded-2xl bg-surface-2 text-ink-2">
            <CameraSlash size={24} />
          </div>
          <p className="t-lead">{t(problem === 'denied' ? 'scan.denied' : 'scan.unavailable')}</p>
          <p className="mt-1 max-w-sm text-ink-2">{t('scan.typeInstead')}</p>
        </div>
      ) : (
        <div className="relative mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-[20px] bg-ink">
          <video ref={video} muted playsInline className="size-full object-cover" aria-label={title} />
          {/* The frame the code should sit in. */}
          <div className="pointer-events-none absolute inset-[14%] rounded-[18px] shadow-[0_0_0_3px_var(--accent),0_0_0_999px_oklch(0.2_0.03_165/0.45)]" />
        </div>
      )}
      <form
        className="mx-auto mt-4 flex w-full max-w-sm gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (typed.trim()) onRead(typed.trim());
        }}
      >
        <input className="input t-code" dir="ltr" autoCapitalize="characters" autoComplete="off" spellCheck={false} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={t('scan.typePlaceholder')} aria-label={t('scan.typePlaceholder')} />
        <button type="submit" className="btn btn-secondary flex-none" disabled={!typed.trim()}>
          {t('scan.go')}
        </button>
      </form>
    </Dialog>
  );
}
