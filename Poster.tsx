import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Coins, UsersThree } from '@phosphor-icons/react';
import { EARN } from '../../../shared/rewards.mjs';
import { useApi } from '@/lib/api';
import { fmtDate, fmtTime } from '@/lib/format';
import { useTitle } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { Loaded } from '@/ui/kit';
import { CountUp, PassField, QR } from '@/ui/pass';
import type { CampusEvent } from './Hub';

/* The poster at the door. Any phone camera that scans it opens the event in the app and checks
   the student in; the count on the poster climbs as they do. Made to be shown on a screen. */

export function checkinLink(eventId: string, code: string) {
  return `${window.location.origin}/campus/events/${encodeURIComponent(eventId)}?checkin=${encodeURIComponent(code)}`;
}

export default function EventPosterPage() {
  const { id } = useParams();
  const { t, l, locale, rtl } = useI18n();
  const q = useApi<CampusEvent>(id ? `/campus/events/${id}` : null);
  const Back = rtl ? ArrowRight : ArrowLeft;
  useTitle(q.data ? l(q.data.title_en, q.data.title_ar) : t('campus.checkin.poster'));

  // The count is the point of the poster: keep it current.
  const reload = q.reload;
  useEffect(() => {
    const timer = setInterval(() => void reload(), 3000);
    return () => clearInterval(timer);
  }, [reload]);

  return (
    <Loaded q={q}>
      {(e) => {
        const checkin = e.checkin;
        return (
          <div className="space-y-4">
            <Link to={`/campus/events/${e.id}`} className="link inline-flex items-center gap-1.5 text-[0.875rem]">
              <Back size={14} weight="bold" />
              {l(e.title_en, e.title_ar)}
            </Link>

            <section className="plate grid gap-8 p-6 sm:p-10 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
              <div className="min-w-0">
                <p className="t-cap">{t('campus.checkin.poster')}</p>
                <h1 className="t-page mt-3 text-[clamp(1.875rem,1.2rem+2.6vw,3.25rem)]!" dir="auto">
                  {l(e.title_en, e.title_ar)}
                </h1>
                <div className="mt-6 flex flex-wrap gap-x-10 gap-y-4">
                  <PassField label={t('campus.events.when')}>
                    {fmtDate(e.start_at, locale, { weekday: 'short', year: undefined })} · <span className="num">{fmtTime(e.start_at, locale)}</span>
                  </PassField>
                  {e.venue_label ? <PassField label={t('campus.events.where')}>{e.venue_label}</PassField> : null}
                  {e.club ? <PassField label={t('poster.by')}>{l(e.club.name_en, e.club.name_ar)}</PassField> : null}
                </div>

                <div className="mt-8 flex flex-wrap items-end gap-x-10 gap-y-5">
                  <div>
                    <p className="fig text-[clamp(3.5rem,2.4rem+5vw,6rem)]">
                      <CountUp value={checkin?.count ?? 0} />
                    </p>
                    <p className="mt-1 flex items-center gap-2 font-semibold text-plate-muted">
                      <UsersThree size={18} weight="fill" />
                      {t('poster.checkedIn')}
                    </p>
                  </div>
                  <p className="chip chip-solid h-9! px-4! text-[0.9375rem]!">
                    <Coins size={16} weight="fill" />
                    {t('poster.earn', { n: EARN.verified })}
                  </p>
                </div>
                <p className="mt-6 max-w-[46ch] text-plate-muted">{t('campus.checkin.posterBody')}</p>
              </div>

              {checkin?.code ? (
                <div className="mx-auto w-full max-w-[20rem] text-center">
                  <QR value={checkinLink(e.id, checkin.code)} size={320} label={t('poster.qr')} className="h-auto w-full rounded-[24px] p-2" />
                  <p className="t-cap mt-5">{t('campus.checkin.enterCode')}</p>
                  <p className="fig mt-1 text-[2.5rem] tracking-[0.12em]!" dir="ltr">
                    {checkin.code}
                  </p>
                  {!checkin.open ? <p className="mt-2 font-semibold text-plate-muted">{new Date(checkin.opens_at) > new Date(checkin.closes_at) || e.is_past ? t('campus.checkin.closed') : t('campus.checkin.opens', { time: `${fmtDate(checkin.opens_at, locale, { weekday: 'short', year: undefined })} ${fmtTime(checkin.opens_at, locale)}` })}</p> : null}
                </div>
              ) : (
                <p className="text-plate-muted">{t('campus.checkin.closed')}</p>
              )}
            </section>
          </div>
        );
      }}
    </Loaded>
  );
}
