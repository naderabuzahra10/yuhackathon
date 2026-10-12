import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowCounterClockwise, Check, Coins, Info, MagnifyingGlass, QrCode, WarningCircle } from '@phosphor-icons/react';
import { readVoucherCode } from '../../shared/rewards.mjs';
import { fmtDateTime, fmtNumber, fmtTime } from '@/lib/format';
import { useTitle } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { OUTLETS, outletOf } from '@/lib/rewards';
import { service, ServiceError } from '@/lib/service';
import { Button, DemoNote, Empty, PageHeader, Sheet } from '@/ui/kit';
import { toast } from '@/ui/overlay';
import { Pass, PassField } from '@/ui/pass';
import { Scanner } from '@/ui/Scanner';

/* The till. A staff member scans or types a voucher code, sees what it buys and for whom, and
   confirms. The student's phone shows "used" a moment later. The outlets' real tills are not
   connected, so in the demo any staff account can stand in for one. */

interface TillVoucher {
  id: string;
  code: string;
  points: number;
  createdAt: string;
  status: 'active' | 'used';
  usedAt?: string;
  item: { name_en: string; name_ar: string } | null;
  outlet: { id: string; name_en: string; name_ar: string } | null;
  student: { first_en: string; first_ar: string };
}

interface Recent {
  recent: TillVoucher[];
  total: number;
  points: number;
}

function OutletMark({ id, size = 44 }: { id: string | undefined; size?: number }) {
  const outlet = id ? outletOf(id) : OUTLETS[0];
  if (!outlet) return null;
  return (
    <span aria-hidden className="grid flex-none place-items-center rounded-[30%] font-extrabold" style={{ width: size, height: size, background: outlet.color, color: outlet.ink, fontSize: Math.round(size * (outlet.mono.length > 1 ? 0.34 : 0.46)), fontStretch: '108%' }}>
      {outlet.mono}
    </span>
  );
}

export default function CashierPage() {
  const { t, l, locale } = useI18n();
  const [params, setParams] = useSearchParams();
  const [code, setCode] = useState('');
  const [voucher, setVoucher] = useState<TillVoucher | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState<'lookup' | 'redeem' | null>(null);
  const [scanning, setScanning] = useState(false);
  const [recent, setRecent] = useState<Recent | null>(null);
  const [missing, setMissing] = useState(false);
  useTitle(t('till.title'));

  const loadRecent = useCallback(async () => {
    try {
      setRecent(await service<Recent>('/rewards/cashier/recent'));
    } catch (e) {
      if (e instanceof ServiceError && e.missing) setMissing(true);
    }
  }, []);

  useEffect(() => {
    void loadRecent();
    const timer = setInterval(() => void loadRecent(), 6000);
    return () => clearInterval(timer);
  }, [loadRecent]);

  const lookup = useCallback(
    async (raw: string) => {
      const clean = readVoucherCode(raw);
      setProblem(null);
      setVoucher(null);
      if (!clean) return setProblem(t('till.badCode'));
      setCode(clean);
      setBusy('lookup');
      try {
        setVoucher((await service<{ voucher: TillVoucher }>('/rewards/cashier/lookup', { body: { code: clean } })).voucher);
      } catch (e) {
        setProblem(e instanceof ServiceError && e.status === 404 ? t('till.notFound') : (e as Error).message);
      } finally {
        setBusy(null);
      }
    },
    [t],
  );

  // A phone camera that scans a voucher opens this page with the code in the address.
  const fromLink = params.get('code');
  useEffect(() => {
    if (!fromLink) return;
    void lookup(fromLink);
    setParams({}, { replace: true });
  }, [fromLink, lookup, setParams]);

  const redeem = async () => {
    if (!voucher) return;
    setBusy('redeem');
    try {
      const done = (await service<{ voucher: TillVoucher }>('/rewards/cashier/redeem', { body: { code: voucher.code } })).voucher;
      setVoucher(done);
      toast.ok(t('till.done'));
      void loadRecent();
    } catch (e) {
      setProblem((e as Error).message);
      void lookup(voucher.code);
    } finally {
      setBusy(null);
    }
  };

  const reset = () => {
    setVoucher(null);
    setProblem(null);
    setCode('');
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void lookup(code);
  };

  return (
    <div data-tone="orange">
      <PageHeader title={t('till.title')} subtitle={t('till.subtitle')} />

      {missing ? (
        <Sheet>
          <Empty icon={<WarningCircle size={24} />} title={t('till.needsServer')} body={t('till.needsServerBody')} />
        </Sheet>
      ) : (
        <div className="grid items-start gap-5 xl:grid-cols-12">
          <div className="space-y-5 xl:col-span-7">
            <Sheet>
              <form onSubmit={submit}>
                <label htmlFor="till-code" className="t-title block">
                  {t('till.codeLabel')}
                </label>
                <div className="mt-3 flex flex-wrap gap-2">
                  <input
                    id="till-code"
                    className="input t-code h-14! min-w-0 flex-1 text-[1.375rem]! uppercase"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="BRN-7K2QXM"
                    autoComplete="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                    dir="ltr"
                    maxLength={12}
                  />
                  <Button type="submit" variant="primary" size="lg" busy={busy === 'lookup'} disabled={!code.trim()} className="h-14!">
                    <MagnifyingGlass size={18} weight="bold" />
                    {t('till.lookUp')}
                  </Button>
                  <Button size="lg" onClick={() => setScanning(true)} className="h-14!">
                    <QrCode size={19} />
                    {t('till.scan')}
                  </Button>
                </div>
              </form>
              {problem ? (
                <p role="alert" className="mt-3 flex items-center gap-2 font-semibold text-red-ink">
                  <WarningCircle size={18} weight="fill" />
                  {problem}
                </p>
              ) : null}
            </Sheet>

            {voucher ? (
              <Pass
                variant="paper"
                used={false}
                stackStub="7.5rem"
                label={t('till.voucher')}
                className="rise"
                stub={
                  <div className="flex h-full flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6">
                    {voucher.status === 'used' ? (
                      <>
                        <span className="stamp text-red-ink">{t('rw.used')}</span>
                        <p className="t-meta">{voucher.usedAt ? fmtDateTime(voucher.usedAt, locale) : ''}</p>
                        <Button onClick={reset}>
                          <ArrowCounterClockwise size={16} />
                          {t('till.next')}
                        </Button>
                      </>
                    ) : (
                      <>
                        <p className="max-w-[26ch] text-[0.875rem] text-ink-2">{t('till.handOver')}</p>
                        <Button variant="primary" size="lg" busy={busy === 'redeem'} onClick={() => void redeem()} autoFocus>
                          <Check size={18} weight="bold" />
                          {t('till.confirm')}
                        </Button>
                      </>
                    )}
                  </div>
                }
              >
                <div className="relative p-5 sm:p-6">
                  <span className="absolute inset-x-0 top-0 h-1.5" style={{ background: outletOf(voucher.outlet?.id ?? '')?.color }} aria-hidden />
                  <div className="flex items-center gap-4 pt-1">
                    <OutletMark id={voucher.outlet?.id} size={56} />
                    <div className="min-w-0 flex-1">
                      <p className="t-page text-[1.5rem]! leading-tight!">{voucher.item ? l(voucher.item.name_en, voucher.item.name_ar) : voucher.code}</p>
                      <p className="mt-0.5 text-ink-2">{voucher.outlet ? l(voucher.outlet.name_en, voucher.outlet.name_ar) : ''}</p>
                    </div>
                  </div>
                  <div className="mt-5 flex flex-wrap gap-x-10 gap-y-3">
                    <PassField label={t('till.for')}>{l(voucher.student.first_en, voucher.student.first_ar)}</PassField>
                    <PassField label={t('rw.cost')}>
                      <span className="num">{fmtNumber(voucher.points, locale)}</span>
                    </PassField>
                    <PassField label={t('rw.code')}>
                      <span className="t-code" dir="ltr">{voucher.code}</span>
                    </PassField>
                    <PassField label={t('rw.issued')}>{fmtDateTime(voucher.createdAt, locale)}</PassField>
                  </div>
                </div>
              </Pass>
            ) : null}

            <div className="well p-4">
              <DemoNote>
                <Info size={15} className="mt-0.5 flex-none" />
                <span>{t('till.demoNote')}</span>
              </DemoNote>
            </div>
          </div>

          <div className="xl:col-span-5">
            <Sheet flush title={t('till.recent')} action={recent ? <span className="chip" data-tone="orange"><Coins size={12} weight="fill" /><span className="num">{fmtNumber(recent.points, locale)}</span></span> : undefined}>
              {recent?.recent.length ? (
                <ul className="rows">
                  {recent.recent.map((v) => (
                    <li key={v.id} className="row">
                      <OutletMark id={v.outlet?.id} size={36} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{v.item ? l(v.item.name_en, v.item.name_ar) : v.code}</span>
                        <span className="t-meta block truncate">
                          {l(v.student.first_en, v.student.first_ar)} · {v.outlet ? l(v.outlet.name_en, v.outlet.name_ar) : ''}
                        </span>
                      </span>
                      <span className="t-meta num flex-none">{v.usedAt ? fmtTime(v.usedAt, locale) : ''}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty icon={<Coins size={24} weight="fill" />} title={t('till.noneYet')} body={t('till.noneYetBody')} />
              )}
            </Sheet>
          </div>
        </div>
      )}

      <Scanner
        open={scanning}
        onClose={() => setScanning(false)}
        title={t('till.scan')}
        hint={t('till.scanHint')}
        onRead={(text) => {
          setScanning(false);
          void lookup(text);
        }}
      />
    </div>
  );
}
