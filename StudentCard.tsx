import { type PointerEvent, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, ArrowsClockwise, SealCheck, X } from '@phosphor-icons/react';
import { useApi } from '@/lib/api';
import { fmtDate, initials } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { QR } from '@/ui/pass';
import '@/styles/idcard.css';

/* The student ID, as a card that opens over the app. It leans toward the pointer, its foil seal
   turns with it, and a tap flips it: identity and code on the front, clubs and verified activity
   on the back. The native dialog element gives it focus trapping and Escape. */

interface Card {
  user: { name_en: string; name_ar: string; student_no: string | null; level: number | null; avatar_color: string };
  program: { code: string; name_en: string; name_ar: string } | null;
  campus: { name_en: string; name_ar: string };
  memberships: Array<{ club_id: string; role: string; name_en: string; name_ar: string; color: string }>;
  achievements: Array<{ id: string; title_en: string; title_ar: string; created_at: string }>;
  qr: { payload: string };
  issued_at: string;
}

function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 36 36" className={className} aria-hidden>
      <rect width="36" height="36" rx="11" fill="oklch(0.2 0.05 165)" />
      <path d="M11 11v8a7 7 0 0 0 14 0v-8" fill="none" stroke="oklch(0.9 0.19 128)" strokeWidth="3.2" strokeLinecap="round" />
      <circle cx="25" cy="11" r="3.2" fill="oklch(0.9 0.19 128)" />
      <circle cx="11" cy="11" r="2.4" fill="oklch(0.2 0.05 165)" stroke="oklch(0.9 0.19 128)" strokeWidth="1.8" />
    </svg>
  );
}

export default function StudentCard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, l, locale, rtl } = useI18n();
  const { can } = useSession();
  const navigate = useNavigate();
  const q = useApi<Card>(open ? '/campus/me/card' : null);
  const [flipped, setFlipped] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const scene = useRef<HTMLDivElement>(null);
  const tilt = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) {
      setFlipped(false);
      el.showModal();
    }
    if (!open && el.open) el.close();
  }, [open]);

  /* The card leans toward the pointer and the light moves across it. Written straight to the
     elements: this runs on every pointer move and must not re-render. */
  const lean = (e: PointerEvent) => {
    const box = scene.current?.getBoundingClientRect();
    const card = tilt.current;
    if (!box || !card || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const clamp = (n: number) => Math.max(-0.7, Math.min(0.7, n));
    const x = clamp((e.clientX - box.left) / box.width - 0.5);
    const y = clamp((e.clientY - box.top) / box.height - 0.5);
    card.style.transitionDuration = '110ms';
    card.style.transform = `rotateX(${(-y * 15).toFixed(2)}deg) rotateY(${(x * 17).toFixed(2)}deg)`;
    // The back face is mirrored, so its light comes from the other side.
    card.querySelectorAll<HTMLElement>('.idc-glare').forEach((g, back) => {
      g.style.background = `radial-gradient(circle at ${((back ? 0.5 - x : x + 0.5) * 100).toFixed(1)}% ${((y + 0.5) * 100).toFixed(1)}%, rgb(255 255 255 / 0.34), transparent 50%)`;
    });
    card.querySelector<HTMLElement>('.idc-holo')?.style.setProperty('--holo', `${Math.round(x * 240 + y * 120)}deg`);
  };
  const settle = () => {
    const card = tilt.current;
    if (!card) return;
    card.style.transitionDuration = '';
    card.style.transform = '';
    card.querySelectorAll<HTMLElement>('.idc-glare').forEach((g) => (g.style.background = ''));
  };

  const go = (path: string) => {
    onClose();
    navigate(path);
  };

  const d = q.data;
  const Arrow = rtl ? ArrowLeft : ArrowRight;
  // The record names the campus in full; the card has room for the place.
  const place = (name: string) => name.replace(/^.*[–-]\s*/, '');
  const roleOf = (role: string) => (t(`campus.clubs.role.${role}`) === `campus.clubs.role.${role}` ? t('campus.clubs.member') : t(`campus.clubs.role.${role}`));

  return createPortal(
    <dialog
      ref={dialog}
      className="idc-dialog"
      aria-label={t('card.title')}
      onClose={onClose}
      onCancel={onClose}
      onPointerMove={lean}
      onPointerLeave={settle}
      onClick={(e) => {
        if (e.target === dialog.current) onClose();
      }}
    >
      {open ? (
        <div className="idc-stage">
          <div ref={scene} className="idc-scene">
            <div className="idc-enter">
              <div ref={tilt} className="idc-tilt">
                <div className="idc-flip" data-flipped={flipped} onClick={() => setFlipped((f) => !f)}>
                  <article className="idc-face idc-front" aria-hidden={flipped}>
                    <span className="idc-slot" aria-hidden />
                    <header className="idc-top">
                      <Mark className="idc-mark" />
                      <div>
                        <p className="idc-uni">{t('card.university')}</p>
                        <p className="idc-kind">{t('card.title')}</p>
                      </div>
                      <span className="idc-holo" aria-hidden>
                        <SealCheck weight="fill" style={{ width: '7.4cqw', height: '7.4cqw' }} />
                      </span>
                    </header>
                    {d ? (
                      <>
                        <div className="idc-body">
                          <div className="idc-who">
                            <span className="idc-avatar" style={{ background: d.user.avatar_color }} aria-hidden>
                              {initials(d.user.name_en)}
                            </span>
                            <div className="min-w-0">
                              {d.user.level ? <span className="idc-chip">{t('card.level', { n: d.user.level })}</span> : null}
                              {d.program ? <p className="idc-prog">{l(d.program.name_en, d.program.name_ar)}</p> : null}
                            </div>
                          </div>
                          <p className="idc-name">{l(d.user.name_en, d.user.name_ar)}</p>
                          <p className="idc-alt">
                            <bdi>{locale === 'ar' ? d.user.name_en : d.user.name_ar}</bdi>
                          </p>
                          <dl className="idc-fields">
                            <div className="col-span-2">
                              <dt className="idc-k">{t('campus.card.studentNo')}</dt>
                              <dd className="idc-no" dir="ltr">
                                {d.user.student_no ?? t('card.noId')}
                              </dd>
                            </div>
                            <div>
                              <dt className="idc-k">{t('campus.card.campus')}</dt>
                              <dd className="idc-v">{place(l(d.campus.name_en, d.campus.name_ar))}</dd>
                            </div>
                            <div>
                              <dt className="idc-k">{t('campus.card.issued')}</dt>
                              <dd className="idc-v">{fmtDate(d.issued_at, locale)}</dd>
                            </div>
                          </dl>
                        </div>
                        <footer className="idc-stub">
                          <QR value={d.qr.payload} label={t('card.qr')} className="idc-qr" />
                          <div className="min-w-0">
                            <p className="idc-k">{t('card.codeLabel')}</p>
                            <p className="idc-stub-lead">{t('card.codeLead')}</p>
                            <p className="idc-fine">{t('card.demoNote')}</p>
                          </div>
                        </footer>
                      </>
                    ) : (
                      <p className="idc-wait">{q.error ? t('card.failed') : t('common.loading')}</p>
                    )}
                    {/* The university mark, pressed faintly into the plastic. */}
                    <svg viewBox="0 0 36 36" className="idc-water" aria-hidden>
                      <path d="M11 11v8a7 7 0 0 0 14 0v-8" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
                      <circle cx="25" cy="11" r="3.2" fill="currentColor" />
                    </svg>
                    <span className="idc-glare" aria-hidden />
                    <span className="idc-sheen" aria-hidden />
                  </article>

                  <article className="idc-face idc-back" aria-hidden={!flipped}>
                    <span className="idc-slot" aria-hidden />
                    <header className="idc-top">
                      <Mark className="idc-mark" />
                      <div className="min-w-0">
                        <p className="idc-uni truncate">{d ? l(d.user.name_en, d.user.name_ar) : t('card.university')}</p>
                        <p className="idc-kind">{t('card.backTitle')}</p>
                      </div>
                    </header>
                    {d ? (
                      <>
                        <div className="idc-body">
                          <section>
                            <h3 className="idc-k">{t('campus.card.memberships')}</h3>
                            {d.memberships.length ? (
                              <ul className="idc-list">
                                {d.memberships.slice(0, 3).map((m) => (
                                  <li key={m.club_id}>
                                    <span className="idc-dot" style={{ background: m.color }} />
                                    <span className="idc-grow">{l(m.name_en, m.name_ar)}</span>
                                    <span className="idc-role">{roleOf(m.role)}</span>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="idc-empty">{t('campus.card.noMemberships')}</p>
                            )}
                          </section>
                          <section>
                            <h3 className="idc-k">{t('campus.card.achievements')}</h3>
                            {d.achievements.length ? (
                              <>
                                <p className="idc-count">
                                  <b>{d.achievements.length}</b>
                                  <span>{t('card.verifiedBy')}</span>
                                </p>
                                <ul className="idc-list">
                                  {d.achievements.slice(0, 4).map((a) => (
                                    <li key={a.id}>
                                      <SealCheck weight="fill" />
                                      <span className="idc-grow" dir="auto">
                                        {l(a.title_en, a.title_ar)}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              </>
                            ) : (
                              <p className="idc-empty">{t('card.noVerified')}</p>
                            )}
                          </section>
                        </div>
                        <footer className="idc-backfoot">
                          {can('portfolio') ? (
                            <button
                              type="button"
                              className="idc-go"
                              tabIndex={flipped ? 0 : -1}
                              onClick={(e) => {
                                e.stopPropagation();
                                go('/portfolio');
                              }}
                            >
                              {t('card.openPortfolio')}
                              <Arrow weight="bold" />
                            </button>
                          ) : null}
                          <p className="idc-fine">{t('card.demoNote')}</p>
                        </footer>
                      </>
                    ) : (
                      <p className="idc-wait">{q.error ? t('card.failed') : t('common.loading')}</p>
                    )}
                    <span className="idc-glare" aria-hidden />
                  </article>
                </div>
              </div>
            </div>
          </div>

          <div className="idc-actions">
            <button type="button" className="idc-btn" onClick={() => setFlipped((f) => !f)} aria-pressed={flipped}>
              <ArrowsClockwise size={18} weight="bold" />
              {t(flipped ? 'card.showFront' : 'card.showBack')}
            </button>
            <button type="button" className="idc-btn idc-round" onClick={onClose} aria-label={t('common.close')}>
              <X size={18} weight="bold" />
            </button>
          </div>
          <p className="idc-hint">{t('card.tapHint')}</p>
        </div>
      ) : null}
    </dialog>,
    document.body,
  );
}
