import { type FormEvent, useEffect, useState } from 'react';
import { Check, CheckCircle, Copy, Key, LinkBreak, PaperPlaneTilt, UserPlus, UsersThree } from '@phosphor-icons/react';
import { api, refreshAll, useApi } from '@/lib/api';
import { weekdayName } from '@/lib/clock';
import { cx, fmtDate, fmtTime } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { Avatar, Button, Chip, Sheet } from '@/ui/kit';
import { Dialog, useAction } from '@/ui/overlay';

/* Planning with a classmate. Private by default: two students connect with a code one gives the
   other in person, each chooses which courses to share, and either can take the other's section
   or suggest their own. Only first names cross the link. */

interface PeerSection {
  id: string;
  section_no: string;
  instructor?: string;
  meetings: Array<{ day: number; start: string; end: string }>;
  seats_left?: number;
}

interface Peer {
  first_en: string;
  first_ar: string;
  avatar_color?: string;
}

interface Link {
  id: string;
  peer: Peer;
  my_shares: string[];
  theirs: Array<{ course_code: string; section: PeerSection | null }>;
}

interface Suggestion {
  id: string;
  link_id: string;
  peer?: Peer;
  course_code: string;
  section: PeerSection | null;
  note?: string | null;
  status?: string;
}

export interface Peers {
  term: string;
  basket: { id: string; revision: number; courses: string[] } | null;
  invites: Array<{ code: string; expires_at: string }>;
  links: Link[];
  incoming: Suggestion[];
  outgoing: Suggestion[];
}

export function usePeers(enabled = true) {
  return useApi<Peers>(enabled ? '/academics/peers' : null);
}

interface Mine {
  id: string;
  revision: number;
  editable: boolean;
  sections: Array<{ id: string; course_code: string; section_no: string }>;
}

export function FriendsPanel({ plan }: { plan: Mine | null }) {
  const { t, l, locale } = useI18n();
  const q = usePeers();
  const { busy, run } = useAction();
  const [code, setCode] = useState('');
  const [found, setFound] = useState<Peer | null>(null);
  const [shares, setShares] = useState<Record<string, string[]>>({});
  const [ending, setEnding] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const data = q.data;

  // Start each link's checkboxes from what is saved.
  useEffect(() => {
    if (data) setShares(Object.fromEntries(data.links.map((x) => [x.id, x.my_shares])));
  }, [data]);

  const act = (key: string, fn: () => Promise<unknown>, ok?: string) =>
    run(key, async () => {
      const result = await fn();
      refreshAll();
      return result;
    }, ok);

  if (!data) return null;
  const name = (p: Peer) => l(p.first_en, p.first_ar);
  const when = (s: PeerSection) => s.meetings.map((m) => `${weekdayName(m.day, locale)} ${fmtTime(m.start, locale)}`).join(' · ');
  const myCourses = plan?.sections.map((s) => s.course_code) ?? data.basket?.courses ?? [];

  const lookUp = (e: FormEvent) => {
    e.preventDefault();
    void run('lookup', async () => setFound((await api<{ peer: Peer }>('/academics/peers/redeem', { body: { code: code.trim() } })).peer));
  };

  /** Put this student in the classmate's section: a swap if the course is in the plan, an add if not. */
  const join = (courseCode: string, theirs: PeerSection) => {
    if (!plan) return;
    const mine = plan.sections.find((s) => s.course_code === courseCode);
    void act(`join-${courseCode}`, () => api(`/academics/proposals/${plan.id}`, { method: 'PUT', body: mine ? { swap: { from: mine.id, to: theirs.id } } : { add: theirs.id } }), t('reg.cmp.switched', { code: courseCode, sec: theirs.section_no }));
  };

  return (
    <Sheet title={<span className="flex items-center gap-2"><UsersThree size={19} weight="fill" className="text-blue" />{t('reg.peer.title')}</span>}>
      <p className="max-w-[72ch] text-ink-2">{t('reg.peer.help')}</p>

      {data.incoming.length ? (
        <div className="mt-5">
          <h3 className="t-label mb-2">{t('reg.peer.incoming')}</h3>
          <ul className="space-y-2">
            {data.incoming.map((s) => (
              <li key={s.id} className="well flex flex-wrap items-center gap-3 p-3.5">
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{t('reg.peer.suggestion', { name: s.peer ? name(s.peer) : '', code: s.course_code, sec: s.section?.section_no ?? '?' })}</span>
                  {s.section ? <span className="t-meta num block">{when(s.section)}</span> : null}
                  {s.note ? <span className="t-meta block" dir="auto">“{s.note}”</span> : null}
                </span>
                <Button size="sm" variant="primary" disabled={!plan?.editable} busy={busy === `apply-${s.id}`} onClick={() => plan && void act(`apply-${s.id}`, () => api(`/academics/peers/proposals/${s.id}/apply`, { body: { proposalId: plan.id, expectedRevision: plan.revision } }), t('reg.cmp.switched', { code: s.course_code, sec: s.section?.section_no ?? '' }))}>
                  {t('reg.peer.accept')}
                </Button>
                <Button size="sm" variant="ghost" busy={busy === `decline-${s.id}`} onClick={() => void act(`decline-${s.id}`, () => api(`/academics/peers/proposals/${s.id}/decline`, { method: 'POST' }), t('reg.peer.declined'))}>
                  {t('reg.peer.decline')}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {data.links.map((link) => {
        const mine = shares[link.id] ?? [];
        const dirty = [...mine].sort().join() !== [...link.my_shares].sort().join();
        const sent = data.outgoing.filter((o) => o.link_id === link.id && o.status !== 'withdrawn');
        return (
          <div key={link.id} className="mt-6 border-t border-rule pt-5">
            <div className="flex items-center gap-3">
              <Avatar name={link.peer.first_en} color={link.peer.avatar_color} size={36} />
              <h3 className="t-title min-w-0 flex-1">{t('reg.peer.with', { name: name(link.peer) })}</h3>
              <Button size="sm" variant="ghost" onClick={() => setEnding(link.id)}>
                <LinkBreak size={15} />
                {t('reg.peer.end')}
              </Button>
            </div>

            <div className="mt-4 grid gap-6 lg:grid-cols-2">
              <div>
                <h4 className="t-label mb-2">{t('reg.peer.theyShare', { name: name(link.peer) })}</h4>
                {link.theirs.length ? (
                  <ul className="space-y-2">
                    {link.theirs.map((share) => {
                      const mineHere = plan?.sections.find((s) => s.course_code === share.course_code);
                      const same = !!share.section && mineHere?.id === share.section.id;
                      return (
                        <li key={share.course_code} className={cx('rounded-2xl border p-3.5', same ? 'border-transparent bg-green-tint' : 'border-rule')}>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            <span className="t-code">{share.course_code}</span>
                            {share.section ? <span className="t-meta">{t('reg.cmp.section', { n: share.section.section_no })}</span> : null}
                            {same ? (
                              <span className="ms-auto flex items-center gap-1.5 text-[0.8125rem] font-bold text-green-ink">
                                <CheckCircle size={15} weight="fill" />
                                {t('reg.peer.same')}
                              </span>
                            ) : mineHere ? (
                              <Chip variant="outline" className="ms-auto">{t('reg.peer.youIn', { sec: mineHere.section_no })}</Chip>
                            ) : null}
                          </div>
                          <p className="t-meta num mt-1">{share.section ? when(share.section) : t('reg.peer.notInBasket')}</p>
                          {share.section && !same && plan?.editable ? (
                            <div className="mt-2.5 flex flex-wrap gap-2">
                              <Button size="sm" variant="primary" busy={busy === `join-${share.course_code}`} onClick={() => join(share.course_code, share.section!)}>
                                {t('fr.join', { name: name(link.peer) })}
                              </Button>
                              {mineHere ? (
                                <Button size="sm" busy={busy === `suggest-${share.course_code}`} onClick={() => void act(`suggest-${share.course_code}`, () => api(`/academics/peers/links/${link.id}/proposals`, { body: { course_code: share.course_code, section_id: mineHere.id } }), t('reg.peer.suggested', { name: name(link.peer) }))}>
                                  <PaperPlaneTilt size={14} />
                                  {t('fr.suggestMine')}
                                </Button>
                              ) : null}
                            </div>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="text-ink-2">{t('reg.peer.theyNothing', { name: name(link.peer) })}</p>
                )}
                {sent.length ? (
                  <ul className="mt-3 space-y-1">
                    {sent.map((o) => (
                      <li key={o.id} className="t-meta flex flex-wrap items-center gap-2">
                        {t('reg.peer.youSuggested', { code: o.course_code, sec: o.section?.section_no ?? '?' })} · {t(`reg.peer.status.${o.status ?? 'open'}`)}
                        {o.status === 'open' ? (
                          <button type="button" className="link" onClick={() => void act(`withdraw-${o.id}`, () => api(`/academics/peers/proposals/${o.id}/withdraw`, { method: 'POST' }))}>
                            {t('reg.peer.withdraw')}
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>

              <fieldset>
                <legend className="t-label mb-2">{t('reg.peer.youShare', { name: name(link.peer) })}</legend>
                {myCourses.length ? (
                  <div className="flex flex-wrap gap-2">
                    {myCourses.map((c) => {
                      const on = mine.includes(c);
                      return (
                        <button key={c} type="button" className="pick t-code" aria-pressed={on} onClick={() => setShares((cur) => ({ ...cur, [link.id]: on ? mine.filter((x) => x !== c) : [...mine, c] }))}>
                          {on ? <Check size={13} weight="bold" /> : null}
                          {c}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-ink-2">{t('reg.peer.noBasket')}</p>
                )}
                {dirty ? (
                  <Button size="sm" variant="primary" className="mt-3" busy={busy === `share-${link.id}`} onClick={() => void act(`share-${link.id}`, () => api(`/academics/peers/links/${link.id}/shares`, { method: 'PUT', body: { courses: mine } }), t('reg.peer.saved'))}>
                    {t('reg.peer.saveShares')}
                  </Button>
                ) : mine.length === 0 ? (
                  <p className="t-meta mt-2">{t('reg.peer.nothingShared')}</p>
                ) : null}
              </fieldset>
            </div>
          </div>
        );
      })}

      <div className="mt-6 grid gap-5 border-t border-rule pt-5 md:grid-cols-2">
        <div>
          <h3 className="t-title flex items-center gap-2">
            <UserPlus size={18} />
            {t('reg.peer.invite')}
          </h3>
          <p className="t-meta mt-1">{t('reg.peer.inviteHelp')}</p>
          <ul className="mt-3 space-y-2">
            {data.invites.map((inv) => (
              <li key={inv.code} className="well flex flex-wrap items-center gap-3 p-3">
                <code className="fig text-[1.375rem] tracking-[0.1em]!" dir="ltr">{inv.code}</code>
                <button
                  type="button"
                  className="btn btn-ghost btn-icon btn-sm"
                  aria-label={t('common.copy')}
                  onClick={() => {
                    void navigator.clipboard?.writeText(inv.code);
                    setCopied(inv.code);
                    window.setTimeout(() => setCopied(null), 1500);
                  }}
                >
                  {copied === inv.code ? <Check size={15} weight="bold" /> : <Copy size={15} />}
                </button>
                <span className="t-meta">{t('reg.peer.expires', { date: fmtDate(inv.expires_at, locale, { weekday: 'short', year: undefined }) })}</span>
                <button type="button" className="link ms-auto text-[0.8125rem]" onClick={() => void act(`cancel-${inv.code}`, () => api(`/academics/peers/invites/${inv.code}`, { method: 'DELETE' }))}>
                  {t('reg.peer.cancelCode')}
                </button>
              </li>
            ))}
          </ul>
          <Button size="sm" className="mt-3" disabled={data.invites.length >= 3} busy={busy === 'invite'} onClick={() => void act('invite', () => api('/academics/peers/invites', { method: 'POST' }))}>
            {t('reg.peer.createCode')}
          </Button>
        </div>

        <div>
          <h3 className="t-title flex items-center gap-2">
            <Key size={18} />
            {t('reg.peer.haveCode')}
          </h3>
          <form className="mt-3 flex gap-2" onSubmit={lookUp}>
            <input
              className="input t-code uppercase"
              value={code}
              onChange={(e) => {
                setCode(e.target.value.toUpperCase());
                setFound(null);
              }}
              placeholder="ABCD2345"
              aria-label={t('reg.peer.codeLabel')}
              autoComplete="off"
              maxLength={12}
              dir="ltr"
            />
            <Button type="submit" busy={busy === 'lookup'} disabled={code.trim().length < 6}>
              {t('reg.peer.lookUp')}
            </Button>
          </form>
          {found ? (
            <div className="well mt-3 flex flex-wrap items-center gap-3 p-3.5">
              <Avatar name={found.first_en} color={found.avatar_color} size={32} />
              <p className="min-w-0 flex-1 font-semibold">{t('reg.peer.codeFrom', { name: name(found) })}</p>
              <Button
                size="sm"
                variant="primary"
                busy={busy === 'connect'}
                onClick={() =>
                  void act('connect', () => api('/academics/peers/redeem', { body: { code: code.trim(), confirm: true } }), t('reg.peer.connected', { name: name(found) })).then(() => {
                    setFound(null);
                    setCode('');
                  })
                }
              >
                {t('reg.peer.connect')}
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      <Dialog
        open={!!ending}
        onClose={() => setEnding(null)}
        title={t('reg.peer.endTitle')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEnding(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                const id = ending;
                setEnding(null);
                if (id) void act('end', () => api(`/academics/peers/links/${id}`, { method: 'DELETE' }), t('reg.peer.ended'));
              }}
            >
              {t('reg.peer.end')}
            </Button>
          </>
        }
      >
        <p className="text-ink-2">{t('reg.peer.endBody')}</p>
      </Dialog>
      {plan && !plan.editable ? <p className="t-meta mt-4">{t('fr.locked')}</p> : null}
    </Sheet>
  );
}
