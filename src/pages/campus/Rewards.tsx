import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowDown, ArrowUp, Basket, BookOpenText, BowlFood, Brain, Bread, Cake, CalendarCheck, ChatCircleDots, Check, Coffee, CoffeeBean, Coins, Cookie, Drop,
  ForkKnife, Hamburger, IceCream, Info, Lightning, ListChecks, Notebook, OrangeSlice, Package, QrCode, SealCheck, Snowflake, Sparkle, Student, TeaBag, Ticket,
  Trophy, UsersThree, type Icon,
} from '@phosphor-icons/react';
import { useAgent } from '@/agent/Agent';
import { useClock } from '@/lib/clock';
import { cx, fmtDate, fmtNumber } from '@/lib/format';
import { useTitle } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { EARN, type EarnKind, type Entry, type ItemIcon, itemOf, type MenuItem, nextReward, OUTLETS, type Outlet, outletOf, useRewards, useVoucherWatch, type Voucher, voucherLink } from '@/lib/rewards';
import { openScanner } from '@/lib/scan';
import { useSession } from '@/lib/session';
import { Button, DemoNote, Empty, PageHeader, SectionHead, Sheet } from '@/ui/kit';
import { Dialog, toast } from '@/ui/overlay';
import { CountUp, Pass, PassField, QR, Ring } from '@/ui/pass';

const ITEM_ICONS: Record<ItemIcon, Icon> = {
  coffee: Coffee, iced: Snowflake, tea: TeaBag, cookie: Cookie, cake: Cake, bread: Bread, bowl: BowlFood, juice: OrangeSlice, icecream: IceCream,
  burger: Hamburger, meal: ForkKnife, water: Drop, bar: Lightning, basket: Basket, notebook: Notebook, voucher: Ticket, box: Package,
};

const KIND_ICONS: Record<EarnKind | 'redeem', Icon> = {
  verified: SealCheck, award: Trophy, attended: CalendarCheck, booked: CalendarCheck, club: UsersThree, classes: Student, classPresent: Student,
  classLate: Student, task: ListChecks, feedback: ChatCircleDots, competition: Trophy, result: Trophy, resource: BookOpenText, quiz: Brain, redeem: Coffee,
};

const EARN_LIST: Array<{ kind: keyof typeof EARN; to: string }> = [
  { kind: 'verified', to: '/campus/events' },
  { kind: 'result', to: '/competitions' },
  { kind: 'resource', to: '/campus/resources' },
  { kind: 'club', to: '/campus/clubs' },
  { kind: 'competition', to: '/competitions' },
  { kind: 'feedback', to: '/feedback' },
  { kind: 'task', to: '/academics/study' },
  { kind: 'quiz', to: '/campus/resources' },
  { kind: 'booked', to: '/campus/events' },
  { kind: 'classPresent', to: '/academics/attendance' },
];

function OutletTile({ outlet, size = 40 }: { outlet: Outlet; size?: number }) {
  return (
    <span aria-hidden className="grid flex-none place-items-center rounded-[30%] font-extrabold" style={{ width: size, height: size, background: outlet.color, color: outlet.ink, fontSize: Math.round(size * (outlet.mono.length > 1 ? 0.34 : 0.46)), fontStretch: '108%' }}>
      {outlet.mono}
    </span>
  );
}

/* A voucher is a paper pass in the outlet's colour: what it buys on the body, the code to scan on the stub. */
function VoucherPass({ voucher, onUse, highlight }: { voucher: Voucher; onUse?: () => void; highlight?: boolean }) {
  const { t, l, locale } = useI18n();
  const outlet = outletOf(voucher.outletId);
  const menuItem = itemOf(voucher.outletId, voucher.itemId);
  if (!outlet || !menuItem) return null;
  const used = voucher.status === 'used';
  return (
    <Pass
      variant="paper"
      used={used}
      stackStub="10.5rem"
      label={`${l(menuItem.name_en, menuItem.name_ar)} · ${l(outlet.name_en, outlet.name_ar)}`}
      className={cx(highlight && 'rise')}
      stub={
        <div className="flex h-full items-center gap-4 px-5 py-4">
          <QR value={voucherLink(voucher.code)} size={104} label={t('rw.qrLabel', { code: voucher.code })} className="flex-none" />
          <div className="min-w-0 flex-1">
            <p className="t-cap">{t('rw.code')}</p>
            <p className="t-code mt-1 text-[1.125rem]" dir="ltr">{voucher.code}</p>
            {used ? (
              <span className="stamp mt-3 text-[0.8125rem] text-red-ink">{t('rw.used')}</span>
            ) : onUse ? (
              <button type="button" className="btn btn-secondary btn-sm mt-3" onClick={onUse}>
                <Check size={14} weight="bold" />
                {t('rw.markUsed')}
              </button>
            ) : (
              <p className="t-meta mt-2 flex items-center gap-2">
                <span className="now-pulse relative size-2 flex-none rounded-full bg-green" data-tone="green" />
                {t('rw.showAtTill')}
              </p>
            )}
          </div>
        </div>
      }
    >
      <div className="relative overflow-hidden p-5">
        <span className="absolute inset-x-0 top-0 h-1.5" style={{ background: outlet.color }} aria-hidden />
        <div className="flex items-center gap-3 pt-1">
          <OutletTile outlet={outlet} size={44} />
          <div className="min-w-0 flex-1">
            <p className="t-title truncate">{l(menuItem.name_en, menuItem.name_ar)}</p>
            <p className="t-meta truncate">{l(outlet.name_en, outlet.name_ar)}</p>
          </div>
        </div>
        <div className="mt-4 flex gap-8">
          <PassField label={t('rw.cost')}>
            <span className="num">{fmtNumber(voucher.points, locale)}</span>
          </PassField>
          <PassField label={t('rw.issued')}>{fmtDate(voucher.createdAt, locale, { year: undefined })}</PassField>
        </div>
      </div>
    </Pass>
  );
}

function MenuCard({ outlet, menuItem, balance, onRedeem, index }: { outlet: Outlet; menuItem: MenuItem; balance: number; onRedeem: () => void; index: number }) {
  const { t, l, locale } = useI18n();
  const ItemIcon = ITEM_ICONS[menuItem.icon];
  const short = menuItem.points - balance;
  return (
    <li className="rise sheet lift flex flex-col overflow-hidden" style={{ ['--i' as string]: Math.min(index, 8) }}>
      <div className="relative grid h-28 place-items-center overflow-hidden" style={{ background: outlet.color, color: outlet.ink }}>
        <ItemIcon size={64} weight="duotone" aria-hidden />
        <span className="absolute start-3 top-3">
          <span className="grid size-7 place-items-center rounded-lg text-[0.6875rem] font-extrabold" style={{ background: outlet.ink, color: outlet.color }} aria-hidden>
            {outlet.mono}
          </span>
        </span>
        <span className="num absolute end-3 top-3 flex h-7 items-center gap-1 rounded-full px-2.5 text-[0.8125rem] font-bold" style={{ background: outlet.ink, color: outlet.color }}>
          <Coins size={13} weight="fill" aria-hidden />
          {fmtNumber(menuItem.points, locale)}
        </span>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <p className="font-bold leading-snug">{l(menuItem.name_en, menuItem.name_ar)}</p>
        <p className="t-meta">{l(outlet.name_en, outlet.name_ar)}</p>
        <div className="mt-auto pt-3.5">
          {short > 0 ? (
            <p className="flex h-[2.125rem] items-center text-[0.8125rem] font-semibold text-ink-2">{t('rw.needMore', { n: fmtNumber(short, locale) })}</p>
          ) : (
            <Button variant="primary" size="sm" onClick={onRedeem} className="w-full">
              {t('rw.redeem')}
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}

function ActivityRow({ entry }: { entry: Entry }) {
  const { t, l, locale } = useI18n();
  const EntryIcon = KIND_ICONS[entry.kind] ?? Coins;
  const spend = entry.points < 0;
  const body = (
    <>
      <span className="glyph" data-tone={spend ? 'orange' : 'green'}>
        <EntryIcon size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold" dir="auto">{l(entry.title_en, entry.title_ar)}</span>
        <span className="t-meta block truncate">
          {t(`rw.kind.${entry.kind}`)}
          {entry.at ? ` · ${fmtDate(entry.at, locale, { year: undefined })}` : ''}
        </span>
      </span>
      <span className={cx('num flex-none font-bold', spend ? 'text-orange-ink' : 'text-green-ink')} dir="ltr">
        {spend ? '' : '+'}
        {fmtNumber(entry.points, locale)}
      </span>
    </>
  );
  return <li>{entry.link ? <Link to={entry.link} className="row">{body}</Link> : <div className="row">{body}</div>}</li>;
}

export default function RewardsPage() {
  const { t, l, locale } = useI18n();
  const { user } = useSession();
  const { now } = useClock();
  const agent = useAgent();
  const r = useRewards();
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState<string>('all');
  const [pending, setPending] = useState<{ outlet: Outlet; item: MenuItem } | null>(null);
  const [issued, setIssued] = useState<Voucher | null>(null);
  const [allActivity, setAllActivity] = useState(false);
  useTitle(t('rw.name'));

  // Arriving from the assistant with a voucher in the address opens that voucher.
  const wanted = params.get('voucher');
  useEffect(() => {
    if (!wanted) return;
    const v = r.vouchers.find((x) => x.id === wanted);
    if (v) setIssued(v);
  }, [wanted, r.vouchers]);

  const next = nextReward(r.balance);
  const menu = useMemo(() => {
    const rows = OUTLETS.filter((o) => filter === 'all' || o.id === filter).flatMap((outlet) => outlet.items.map((menuItem) => ({ outlet, menuItem })));
    // What the balance already covers comes first, dearest first; then the nearest things to save for.
    return rows.sort((a, b) => {
      const ca = a.menuItem.points <= r.balance;
      const cb = b.menuItem.points <= r.balance;
      if (ca !== cb) return ca ? -1 : 1;
      return ca ? b.menuItem.points - a.menuItem.points : a.menuItem.points - b.menuItem.points;
    });
  }, [filter, r.balance]);

  const active = r.vouchers.filter((v) => v.status === 'active');
  const used = r.vouchers.filter((v) => v.status === 'used');
  const activity = allActivity ? r.entries : r.entries.slice(0, 7);

  // While a voucher is on screen, watch for the till scanning it.
  useVoucherWatch(active.length > 0 || !!issued);

  const confirm = async () => {
    if (!pending) return;
    const choice = pending;
    setPending(null);
    try {
      setIssued(await r.redeem(choice.outlet, choice.item, now));
    } catch (e) {
      toast.error(e);
    }
  };

  const closeIssued = () => {
    setIssued(null);
    if (wanted) setParams({}, { replace: true });
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title={t('rw.name')}
        subtitle={t('rw.subtitle')}
        crumbs={[{ label: t('nav.campus'), to: '/campus' }, { label: t('rw.name') }]}
        actions={
          <>
            <Button variant="primary" onClick={openScanner}>
              <QrCode size={17} />
              {t('scan.earn')}
            </Button>
            <Button onClick={() => agent.ask(t('ai.s.rew1'))}>
              <Sparkle size={16} weight="fill" />
              {t('rw.askAgent')}
            </Button>
          </>
        }
      />

      <div className="grid gap-5 xl:grid-cols-12">
        <div className="rise xl:col-span-7">
          <Pass
            side
            variant="orange"
            className="h-full"
            stackStub="9rem"
            sideStub="13.5rem"
            label={t('rw.name')}
            stub={
              <div className="flex h-full items-center gap-4 p-5 md:flex-col md:justify-center md:text-center">
                <Ring value={next ? r.balance : 1} max={next ? next.item.points : 1} size={92} stroke={9} label={t('rw.nextReward')}>
                  <Coffee size={30} weight="duotone" />
                </Ring>
                <div className="min-w-0">
                  <p className="t-cap">{t('rw.nextReward')}</p>
                  <p className="mt-1 text-[0.875rem] font-bold leading-snug">
                    {next ? t('rw.toNext', { n: fmtNumber(next.item.points - r.balance, locale), item: l(next.item.name_en, next.item.name_ar) }) : t('rw.everything')}
                  </p>
                </div>
              </div>
            }
          >
            <div className="flex h-full flex-col p-5 sm:p-7">
              <p className="flex items-center gap-2 font-bold">
                <Coins size={19} weight="fill" />
                {t('rw.balance')}
              </p>
              <p className="fig mt-3 text-[clamp(3.25rem,2.4rem+4vw,5rem)]">{r.ready ? <CountUp value={r.balance} format={(n) => fmtNumber(n, locale)} /> : '…'}</p>
              <div className="mt-auto flex flex-wrap gap-x-10 gap-y-4 pt-6">
                <PassField label={t('rw.earned')}>
                  <span className="num inline-flex items-center gap-1">
                    <ArrowUp size={13} weight="bold" />
                    {fmtNumber(r.earned, locale)}
                  </span>
                </PassField>
                <PassField label={t('rw.spent')}>
                  <span className="num inline-flex items-center gap-1">
                    <ArrowDown size={13} weight="bold" />
                    {fmtNumber(r.spent, locale)}
                  </span>
                </PassField>
                <PassField label={t('rw.member')}>{user ? l(user.name_en, user.name_ar) : ''}</PassField>
              </div>
            </div>
          </Pass>
        </div>

        <div className="rise xl:col-span-5" style={{ ['--i' as string]: 1 }}>
          <Sheet flush title={t('rw.howToEarn')} className="h-full">
            <ul className="grid grid-cols-1 gap-x-2 px-2.5 pb-3 sm:grid-cols-2 xl:grid-cols-1">
              {EARN_LIST.map((e) => (
                <li key={e.kind}>
                  <Link to={e.to} className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 transition-colors duration-150 hover:bg-surface-2">
                    <span className="num w-12 flex-none text-end font-bold text-green-ink" dir="ltr">+{EARN[e.kind]}</span>
                    <span className="min-w-0 flex-1 truncate text-[0.875rem] font-medium">{t(`rw.earn.${e.kind}`)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Sheet>
        </div>
      </div>

      {active.length ? (
        <section aria-labelledby="vouchers-h">
          <SectionHead title={<span id="vouchers-h">{t('rw.vouchers')}</span>} hint={t(r.mode === 'device' ? 'rw.vouchersHint' : 'rw.vouchersLive')} />
          <div className="grid gap-5 md:grid-cols-2">
            {active.map((v) => (
              <VoucherPass key={v.id} voucher={v} highlight={v.id === issued?.id} onUse={r.mode === 'device' ? () => r.markUsed(v.id, now) : undefined} />
            ))}
          </div>
        </section>
      ) : null}

      <section aria-labelledby="menu-h">
        <SectionHead title={<span id="menu-h">{t('rw.menu')}</span>} hint={t('rw.menuHint')} />
        <div className="scroll-x -mx-1 mb-4 flex gap-2 px-1" role="group" aria-label={t('rw.outlets')}>
          <button type="button" className="pick flex-none" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
            {t('common.all')}
          </button>
          {OUTLETS.map((o) => (
            <button key={o.id} type="button" className="pick flex-none ps-1.5!" aria-pressed={filter === o.id} onClick={() => setFilter(o.id)}>
              <OutletTile outlet={o} size={24} />
              {l(o.name_en, o.name_ar)}
            </button>
          ))}
        </div>
        <ul key={filter} className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
          {menu.map(({ outlet, menuItem }, i) => (
            <MenuCard key={menuItem.id} outlet={outlet} menuItem={menuItem} balance={r.balance} index={i} onRedeem={() => setPending({ outlet, item: menuItem })} />
          ))}
        </ul>
      </section>

      <div className="grid items-start gap-5 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <Sheet
            flush
            title={t('rw.activity')}
            action={
              r.entries.length > 7 ? (
                <Button size="sm" variant="ghost" onClick={() => setAllActivity((v) => !v)}>
                  {t(allActivity ? 'common.less' : 'common.more')}
                </Button>
              ) : undefined
            }
          >
            {activity.length ? (
              <ul className="rows">
                {activity.map((e) => (
                  <ActivityRow key={e.id} entry={e} />
                ))}
              </ul>
            ) : (
              <Empty icon={<Coins size={24} weight="fill" />} title={t(r.loading ? 'common.loading' : 'rw.noActivity')} body={r.loading ? undefined : t('rw.noActivityBody')} />
            )}
          </Sheet>
        </div>
        <div className="space-y-5 lg:col-span-5">
          {used.length ? (
            <section aria-labelledby="used-h">
              <SectionHead title={<span id="used-h">{t('rw.usedVouchers')}</span>} />
              <div className="space-y-4">
                {used.slice(0, 3).map((v) => (
                  <VoucherPass key={v.id} voucher={v} />
                ))}
              </div>
            </section>
          ) : null}
          <div className="well p-4">
            <DemoNote>
              <Info size={15} className="mt-0.5 flex-none" />
              <span>{t(r.mode === 'device' ? 'rw.demoNote' : 'rw.serverNote')}</span>
            </DemoNote>
          </div>
        </div>
      </div>

      <Dialog
        open={!!pending}
        onClose={() => setPending(null)}
        title={t('rw.confirmTitle')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPending(null)}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" onClick={() => void confirm()} autoFocus>
              <Coins size={16} weight="fill" />
              {pending ? t('rw.spendN', { n: fmtNumber(pending.item.points, locale) }) : ''}
            </Button>
          </>
        }
      >
        {pending ? (
          <div>
            <div className="flex items-center gap-3.5">
              <OutletTile outlet={pending.outlet} size={52} />
              <div className="min-w-0">
                <p className="t-title">{l(pending.item.name_en, pending.item.name_ar)}</p>
                <p className="t-meta">{l(pending.outlet.name_en, pending.outlet.name_ar)} · {l(pending.outlet.kind_en, pending.outlet.kind_ar)}</p>
              </div>
            </div>
            <dl className="well mt-4 grid grid-cols-3 gap-3 p-4 text-center">
              <div>
                <dt className="t-label">{t('rw.balance')}</dt>
                <dd className="fig mt-1.5 text-[1.375rem]">{fmtNumber(r.balance, locale)}</dd>
              </div>
              <div>
                <dt className="t-label">{t('rw.cost')}</dt>
                <dd className="fig mt-1.5 text-[1.375rem] text-orange-ink">-{fmtNumber(pending.item.points, locale)}</dd>
              </div>
              <div>
                <dt className="t-label">{t('rw.after')}</dt>
                <dd className="fig mt-1.5 text-[1.375rem]">{fmtNumber(r.balance - pending.item.points, locale)}</dd>
              </div>
            </dl>
            <p className="t-meta mt-3">{t('rw.confirmBody')}</p>
          </div>
        ) : null}
      </Dialog>

      <Dialog open={!!issued} onClose={closeIssued} title={t('rw.issuedTitle')} subtitle={t('rw.issuedBody')} footer={<Button variant="primary" onClick={closeIssued} autoFocus>{t('rw.done')}</Button>}>
        {issued ? <VoucherPass voucher={r.vouchers.find((v) => v.id === issued.id) ?? issued} /> : null}
      </Dialog>
    </div>
  );
}
