import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowSquareOut, CaretDown, Trophy } from '@phosphor-icons/react';
import { api, refreshAll, useApi } from '@/lib/api';
import { cx, fmtDate, fmtDateTime, fmtRange } from '@/lib/format';
import { useTitle } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { Button, Chip, Empty, Field, Loaded, PageHeader, Segmented, Sheet } from '@/ui/kit';
import { type Stage, StageLine } from '@/ui/line';
import { Dialog, toast, useAction } from '@/ui/overlay';

type EntryStatus = 'interested' | 'registered' | 'team_formed' | 'submitted' | 'result';

interface Competition {
  id: string;
  title: string;
  organiser: string;
  kind: string;
  scope: string;
  format: string;
  city: string | null;
  registration_opens: string | null;
  registration_deadline: string | null;
  starts_at: string;
  ends_at: string;
  team: { min: number; max: number };
  eligibility: string | null;
  prizes: string | null;
  url: string | null;
  description: string | null;
  segment: 'open' | 'upcoming' | 'past';
  days_left: number;
  fit: string[];
  entry: { status: EntryStatus; team_name: string | null; result: string | null; portfolio_item_id: string | null } | null;
}

const ENTRY_FLOW: EntryStatus[] = ['interested', 'registered', 'team_formed', 'submitted', 'result'];

export default function CompetitionsPage() {
  const { t, locale } = useI18n();
  useTitle(t('nav.competitions'));
  const [params, setParams] = useSearchParams();
  const segment = (params.get('segment') as 'open' | 'upcoming' | 'past' | 'mine') ?? 'open';
  const q = useApi<{ items: Competition[]; counts: Record<string, number> }>('/career/competitions');
  const live = useApi<{ items: Array<{ id: string; title: string; starts_at: string; duration_min: number; url: string }> }>('/career/competitions-live');
  const [open, setOpen] = useState<string | null>(params.get('id'));
  const [form, setForm] = useState<{ comp: Competition; status: EntryStatus } | null>(null);
  const [teamName, setTeamName] = useState('');
  const [result, setResult] = useState('');
  const { busy, run } = useAction();

  const setEntry = (c: Competition, status: EntryStatus, extra: Record<string, string> = {}) =>
    void run(`${c.id}-${status}`, async () => {
      await api(`/career/competitions/${c.id}/entry`, { method: 'PUT', body: { status, ...extra } });
      toast.ok(t(`comp.toast.${status}`));
      setForm(null);
      refreshAll();
    });

  const withdraw = (c: Competition) =>
    void run(`${c.id}-withdraw`, async () => {
      await api(`/career/competitions/${c.id}/entry`, { method: 'DELETE' });
      toast.ok(t('comp.toast.withdrawn'));
      refreshAll();
    });

  const advance = (c: Competition, status: EntryStatus) => {
    if (status === 'team_formed' || status === 'result') {
      setTeamName(c.entry?.team_name ?? '');
      setResult(c.entry?.result ?? '');
      setForm({ comp: c, status });
    } else setEntry(c, status);
  };

  return (
    <div data-tone="purple">
      <PageHeader title={t('nav.competitions')} subtitle={t('comp.intro')} />
      <Loaded q={q}>
        {(d) => {
          const list = d.items.filter((c) => (segment === 'mine' ? !!c.entry : c.segment === segment));
          return (
            <>
              <div className="scroll-x mb-5">
                <Segmented
                  label={t('comp.segments')}
                  value={segment}
                  onChange={(v) => setParams(v === 'open' ? {} : { segment: v }, { replace: true })}
                  options={(['open', 'upcoming', 'past', 'mine'] as const).map((s) => ({ value: s, label: `${t(`comp.segment.${s}`)} · ${d.counts[s] ?? 0}` }))}
                />
              </div>
              {list.length ? (
                <ul className="space-y-4">
                  {list.map((c) => {
                    const isOpen = open === c.id;
                    const at = c.entry ? ENTRY_FLOW.indexOf(c.entry.status) : -1;
                    const stages: Stage[] = ENTRY_FLOW.map((s, i) => ({ key: s, label: t(`comp.status.${s}`), state: i < at || (i === at && s === 'result') ? 'done' : i === at ? 'current' : 'todo' }));
                    const next = c.entry ? ENTRY_FLOW[at + 1] : 'interested';
                    const deadline = c.registration_deadline;
                    return (
                      <li key={c.id} className="sheet overflow-hidden">
                        <div className="flex flex-wrap items-start gap-x-5 gap-y-3 px-4.5 py-4">
                          <div className="min-w-0 flex-1 basis-72">
                            <button type="button" className="text-start" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : c.id)}>
                              <span className="t-lead flex items-center gap-2">
                                {c.title}
                                <CaretDown size={13} weight="bold" className={cx('flex-none text-ink-3 transition-transform duration-200', isOpen && 'rotate-180')} />
                              </span>
                            </button>
                            <p className="t-meta mt-0.5">{[c.organiser, t(`comp.kind.${c.kind}`), t(`comp.scope.${c.scope}`), t(`comp.format.${c.format}`), c.city].filter(Boolean).join(' · ')}</p>
                            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                              {c.segment === 'open' && deadline ? (
                                <Chip tone={c.days_left <= 7 ? 'red' : 'yellow'}>{t('comp.closesIn', { n: c.days_left, date: fmtDate(deadline, locale, { year: undefined }) })}</Chip>
                              ) : c.segment === 'upcoming' && c.registration_opens ? (
                                <Chip variant="outline">{t('comp.opensOn', { date: fmtDate(c.registration_opens, locale, { year: undefined }) })}</Chip>
                              ) : c.segment === 'past' ? (
                                <Chip variant="outline">{t('comp.ended', { date: fmtDate(c.ends_at, locale) })}</Chip>
                              ) : null}
                              <Chip variant="outline">{c.team.max <= 1 ? t('comp.solo') : c.team.min === c.team.max ? t('comp.teamOf', { n: c.team.max }) : t('comp.teamRange', { min: c.team.min, max: c.team.max })}</Chip>
                              {c.fit.length ? <Chip tone="green">{t('comp.goodFit', { skills: c.fit.join(', ') })}</Chip> : null}
                              {c.entry?.result ? (
                                <Chip tone="purple">
                                  <Trophy size={12} weight="fill" />
                                  {c.entry.result}
                                </Chip>
                              ) : null}
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            {c.entry?.portfolio_item_id ? (
                              <Link to="/portfolio#achievements" className="btn btn-secondary btn-sm">
                                {t('comp.viewInPortfolio')}
                              </Link>
                            ) : null}
                            {next && (c.segment !== 'past' || next === 'result') ? (
                              <Button size="sm" variant="primary" busy={busy === `${c.id}-${next}`} onClick={() => advance(c, next)}>
                                {t(next === 'result' ? 'comp.action.addResult' : `comp.action.${next}`)}
                              </Button>
                            ) : null}
                            {c.entry && c.entry.status !== 'result' ? (
                              <Button size="sm" variant="ghost" busy={busy === `${c.id}-withdraw`} onClick={() => withdraw(c)}>
                                {t('comp.action.withdraw')}
                              </Button>
                            ) : null}
                          </div>
                        </div>
                        {c.entry ? (
                          <div className="border-t border-rule px-4.5 py-4">
                            <StageLine stages={stages} tone="purple" label={t('common.status')} dense />
                          </div>
                        ) : null}
                        {isOpen ? (
                          <div className="border-t border-rule bg-surface-2/50 px-4.5 py-4">
                            {c.description ? <p className="max-w-[72ch] text-ink-2">{c.description}</p> : null}
                            <dl className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-[9rem_1fr]">
                              <dt className="t-label pt-0.5">{t('comp.dates')}</dt>
                              <dd className="num">{fmtRange(c.starts_at, c.ends_at, locale)}</dd>
                              {deadline ? (
                                <>
                                  <dt className="t-label pt-0.5">{t('comp.registration')}</dt>
                                  <dd className="num">{fmtRange(c.registration_opens ?? deadline, deadline, locale)}</dd>
                                </>
                              ) : null}
                              {c.prizes ? (
                                <>
                                  <dt className="t-label pt-0.5">{t('comp.prizes')}</dt>
                                  <dd>{c.prizes}</dd>
                                </>
                              ) : null}
                              {c.eligibility ? (
                                <>
                                  <dt className="t-label pt-0.5">{t('career.eligibility')}</dt>
                                  <dd>{c.eligibility}</dd>
                                </>
                              ) : null}
                            </dl>
                            <p className="t-meta mt-3">{t('comp.registerNote')}</p>
                            {c.url ? (
                              <a href={c.url} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm mt-3">
                                <ArrowSquareOut size={14} />
                                {t('comp.officialPage')}
                              </a>
                            ) : null}
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <Sheet>
                  <Empty icon={<Trophy size={22} />} title={t(`comp.empty.${segment}`)} />
                </Sheet>
              )}
              <p className="t-meta mt-3">{t('comp.calendarNote')}</p>
            </>
          );
        }}
      </Loaded>

      <div className="mt-8">
        <Sheet flush title={t('comp.live.title')}>
          <p className="border-b border-rule px-4.5 py-3 text-ink-2">{t('comp.live.body')}</p>
          {live.error ? (
            <p className="px-4.5 py-5 text-ink-2">{t('comp.live.error')}</p>
          ) : (
            <ul className="rows">
              {(live.data?.items ?? []).map((r) => (
                <li key={r.id}>
                  <a href={r.url} target="_blank" rel="noreferrer" className="row">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold" dir="ltr">
                        {r.title}
                      </span>
                      <span className="t-meta block num">
                        {fmtDateTime(r.starts_at, locale)} · {t('comp.live.duration', { n: Math.round((r.duration_min / 60) * 10) / 10 })}
                      </span>
                    </span>
                    <ArrowSquareOut size={15} className="flex-none text-ink-3" />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Sheet>
      </div>

      <Dialog
        open={!!form}
        onClose={() => setForm(null)}
        title={form ? t(form.status === 'result' ? 'comp.action.addResult' : 'comp.action.team_formed') : ''}
        subtitle={form?.comp.title}
        footer={
          <>
            <Button variant="ghost" onClick={() => setForm(null)}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" busy={!!busy} disabled={form?.status === 'result' ? !result.trim() : !teamName.trim()} onClick={() => form && setEntry(form.comp, form.status, form.status === 'result' ? { result: result.trim(), team_name: teamName.trim() } : { team_name: teamName.trim() })}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label={t('comp.teamName')} optional={form?.status === 'result'}>
            {(p) => <input {...p} className="input" value={teamName} onChange={(e) => setTeamName(e.target.value)} />}
          </Field>
          {form?.status === 'result' ? (
            <>
              <Field label={t('comp.result')} hint={t('comp.resultHint')}>
                {(p) => <input {...p} className="input" value={result} onChange={(e) => setResult(e.target.value)} placeholder={t('comp.resultPlaceholder')} />}
              </Field>
              <p className="t-meta">{t(form.comp.scope === 'yu' ? 'comp.resultVerifiedNote' : 'comp.resultSelfNote')}</p>
            </>
          ) : null}
        </div>
      </Dialog>
    </div>
  );
}
