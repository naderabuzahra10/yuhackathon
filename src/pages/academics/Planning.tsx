import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle, Circle, EnvelopeSimple, ListChecks, LockSimple, Plus, Sparkle, Trash, Warning } from '@phosphor-icons/react';
import { api, refreshAll, useApi } from '@/lib/api';
import { addDays, weekdayName } from '@/lib/clock';
import { cx, fmtDate, fmtDateTime, fmtTime } from '@/lib/format';
import { useDebounced, useStored } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { Button, Chip, Empty, Field, Loaded, SectionHead, Segmented, Sheet, Status, type Tone } from '@/ui/kit';
import { type Stage, StageLine, Stop, Stops } from '@/ui/line';
import { toast, useAction } from '@/ui/overlay';
import { RevisionPlanner } from './Coach';

type L10n = { en: string; ar: string };

/* ── Study planner ── */

interface PlanItem {
  id: string;
  title: string;
  description: string;
  course_code: string | null;
  kind: 'task' | 'assessment' | 'reminder';
  assessment_kind: string | null;
  date: string | null;
  deadline: string | null;
  due_at: string | null;
  urgency: 'high' | 'medium' | 'low';
  done: boolean;
  source: string;
  location_text: string | null;
  cancelled: boolean;
  email: { from_name: string } | null;
  overdue: boolean;
  editable: boolean;
}

interface Planner {
  today: string;
  items: PlanItem[];
  emails: Array<{ id: string; course_code: string; from_name: string; subject: string; received_at: string; scheduled: boolean }>;
}

const URGENCY_TONE: Record<PlanItem['urgency'], Tone> = { high: 'red', medium: 'yellow', low: 'neutral' };

export function StudyPage() {
  const { t, locale } = useI18n();
  const q = useApi<Planner>('/academics/planner');
  const [filter, setFilter] = useState<'all' | 'instructors' | 'mine'>('all');
  const [text, setText] = useState('');
  const draftText = useDebounced(text, 300);
  const [preview, setPreview] = useState<{ kind: string; course_code: string | null; date: string | null; time: string | null } | null>(null);
  const { busy, run } = useAction();

  useEffect(() => {
    if (draftText.trim().length < 3) return setPreview(null);
    let live = true;
    api('/academics/planner/quick', { body: { text: draftText, dry_run: true } })
      .then((r) => live && setPreview(r))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [draftText]);

  const add = () =>
    void run('add', async () => {
      await api('/academics/planner/quick', { body: { text } });
      setText('');
      setPreview(null);
      toast.ok(t('planner.added'));
      refreshAll();
    });

  const toggle = (item: PlanItem) => {
    q.set((prev) => prev && { ...prev, items: prev.items.map((x) => (x.id === item.id ? { ...x, done: !x.done, overdue: x.done ? x.overdue : false } : x)) });
    void api(`/academics/planner/items/${item.id}`, { method: 'PATCH', body: { done: !item.done } })
      .catch((e) => toast.error(e))
      .finally(() => void q.reload());
  };

  return (
    <Loaded q={q}>
      {(d) => {
        const visible = d.items.filter((i) => (filter === 'all' ? true : filter === 'instructors' ? i.kind === 'assessment' : i.kind !== 'assessment'));
        const day = (i: PlanItem) => i.date ?? i.deadline;
        const tomorrow = addDays(d.today, 1);
        const weekEnd = addDays(d.today, 7);
        const groups: Array<[string, PlanItem[], Tone]> = [
          ['overdue', visible.filter((i) => !i.done && i.overdue), 'red'],
          ['today', visible.filter((i) => !i.done && !i.overdue && day(i) === d.today), 'blue'],
          ['tomorrow', visible.filter((i) => !i.done && !i.overdue && day(i) === tomorrow), 'blue'],
          ['week', visible.filter((i) => !i.done && !i.overdue && !!day(i) && day(i)! > tomorrow && day(i)! <= weekEnd), 'neutral'],
          ['later', visible.filter((i) => !i.done && !i.overdue && !!day(i) && day(i)! > weekEnd), 'neutral'],
          ['someday', visible.filter((i) => !i.done && !i.overdue && !day(i)), 'neutral'],
        ];
        const done = visible.filter((i) => i.done);
        return (
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
            <div className="space-y-6">
              <RevisionPlanner />
              <form
                className="sheet p-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (text.trim().length >= 2) add();
                }}
              >
                <label htmlFor="quick-add" className="label">
                  {t('planner.quick.label')}
                </label>
                <div className="flex gap-2">
                  <input id="quick-add" className="input h-11!" value={text} onChange={(e) => setText(e.target.value)} placeholder={t('planner.quick.placeholder')} autoComplete="off" />
                  <Button type="submit" variant="primary" size="lg" busy={busy === 'add'} disabled={text.trim().length < 2}>
                    <Plus size={16} weight="bold" />
                    {t('planner.quick.add')}
                  </Button>
                </div>
                <p className="help" aria-live="polite">
                  {preview ? (
                    <>
                      <span className="font-semibold text-ink">{t('planner.quick.willAdd')}: </span>
                      {[preview.kind === 'reminder' ? t('planner.reminder') : t('planner.task'), preview.course_code, preview.date ? fmtDate(preview.date, locale, { weekday: 'short', year: undefined }) : t('planner.quick.noDate'), preview.time ? fmtTime(preview.time, locale) : null].filter(Boolean).join(' · ')}
                    </>
                  ) : (
                    t('planner.quick.hint')
                  )}
                </p>
              </form>

              <Segmented label={t('planner.filter')} value={filter} onChange={setFilter} options={(['all', 'instructors', 'mine'] as const).map((f) => ({ value: f, label: t(`planner.filter.${f}`) }))} />

              {groups.every(([, items]) => !items.length) && !done.length ? (
                <Sheet>
                  <Empty icon={<ListChecks size={22} />} title={t('planner.empty')} body={t('planner.emptyBody')} />
                </Sheet>
              ) : null}

              {[...groups, ['done', done, 'green'] as [string, PlanItem[], Tone]].map(([key, items, tone]) =>
                items.length ? (
                  <section key={key} data-tone={tone}>
                    <h2 className="mb-2 flex items-center gap-2 px-0.5">
                      <span className="dot" />
                      <span className="t-title">{key === 'done' ? t('planner.group.done', { n: items.length }) : t(`planner.group.${key}`)}</span>
                      {key !== 'done' ? <span className="t-meta num">{items.length}</span> : null}
                    </h2>
                    <ul className="sheet rows overflow-hidden">
                      {items.map((item) => (
                        <li key={item.id} className="flex items-start gap-3 px-4 py-3">
                          <button type="button" onClick={() => toggle(item)} aria-pressed={item.done} aria-label={t(item.done ? 'planner.markUndone' : 'planner.markDone', { title: item.title })} className="mt-0.5 flex-none rounded-full text-ink-3 transition-transform duration-150 hover:text-green active:scale-90">
                            {item.done ? <CheckCircle size={22} weight="fill" className="text-green" /> : <Circle size={22} />}
                          </button>
                          <div className="min-w-0 flex-1">
                            <p className={cx('font-semibold', item.done && 'text-ink-2 line-through')} dir="auto">
                              {item.title}
                            </p>
                            <p className="t-meta mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                              {item.course_code ? <span className="t-code text-blue-ink">{item.course_code}</span> : null}
                              {item.assessment_kind ? <span>{t(`planner.kind.${item.assessment_kind}`)}</span> : null}
                              {item.due_at ? <span>{t('planner.due', { when: fmtDateTime(item.due_at, locale) })}</span> : item.deadline ? <span>{t('planner.due', { when: fmtDate(item.deadline, locale, { weekday: 'short', year: undefined }) })}</span> : null}
                              {item.email ? (
                                <span className="inline-flex items-center gap-1">
                                  <EnvelopeSimple size={12} />
                                  {t('planner.fromEmail', { name: item.email.from_name })}
                                </span>
                              ) : null}
                            </p>
                          </div>
                          {item.urgency !== 'medium' && !item.done ? <Chip tone={URGENCY_TONE[item.urgency]}>{t(`planner.urgency.${item.urgency}`)}</Chip> : null}
                          {item.editable ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              icon
                              aria-label={t('planner.delete')}
                              onClick={() =>
                                void run(`del-${item.id}`, async () => {
                                  await api(`/academics/planner/items/${item.id}`, { method: 'DELETE' });
                                  toast.ok(t('planner.deleted'));
                                  refreshAll();
                                })
                              }
                            >
                              <Trash size={15} />
                            </Button>
                          ) : (
                            <LockSimple size={14} weight="fill" className="mt-1 flex-none text-ink-3" aria-label={t('planner.detail.locked')} />
                          )}
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null,
              )}
            </div>

            <Sheet flush title={t('planner.inbox.title')}>
              <p className="border-b border-rule px-4.5 py-3 text-ink-2">{t('planner.inbox.body')}</p>
              {d.emails.length ? (
                <ul className="rows">
                  {d.emails.map((e) => (
                    <li key={e.id} className="px-4.5 py-3">
                      <p className="flex items-start gap-2">
                        <span className="min-w-0 flex-1 font-semibold" dir="auto">
                          {e.subject}
                        </span>
                        <Chip tone={e.scheduled ? 'green' : 'neutral'}>{t(e.scheduled ? 'planner.inbox.added' : 'planner.inbox.skipped')}</Chip>
                      </p>
                      <p className="t-meta mt-0.5">
                        <span className="t-code">{e.course_code}</span> · {e.from_name} · {fmtDate(e.received_at, locale, { year: undefined })}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-4.5 py-5 text-ink-2">{t('planner.inbox.empty')}</p>
              )}
            </Sheet>
          </div>
        );
      }}
    </Loaded>
  );
}

/* ── GPA planner ── */

interface Gpa {
  policy: { name_en: string; name_ar: string; scale: number; points: Record<string, number>; source_en: string; source_ar: string };
  sources: Array<{ label_en: string; label_ar: string; url: string }>;
  scholarship: { name_en: string; name_ar: string; url: string; note_en: string; note_ar: string; categories: Array<{ id: string; min_gpa: number; discount: number }> };
  markers: Array<{ id: string; min_gpa: number; label_en: string; label_ar: string }>;
  official: { gpa: number; gpaCredits: number; earnedCredits: number; byTerm: Array<{ term: string; label: L10n; gpa: number; gpaCredits: number }> };
  current: { label: L10n; courses: Array<{ code: string; title_en: string; title_ar: string; credits: number }> };
  remainingCredits: number;
}

export function GpaPage() {
  const { t, l } = useI18n();
  const q = useApi<Gpa>('/academics/gpa');
  // Estimates are personal planning, kept on this device only.
  const [stored, setStored] = useStored<string>('uj.gpa.estimates', '{}');
  const grades = useMemo<Record<string, string>>(() => {
    try {
      return JSON.parse(stored);
    } catch {
      return {};
    }
  }, [stored]);
  const [target, setTarget] = useState<number | null>(null);

  return (
    <Loaded q={q}>
      {(d) => {
        const letters = Object.keys(d.policy.points).filter((x) => x !== 'DN');
        const estimated = d.current.courses.filter((c) => grades[c.code] in d.policy.points);
        const termCredits = estimated.reduce((n, c) => n + c.credits, 0);
        const termPoints = estimated.reduce((n, c) => n + c.credits * d.policy.points[grades[c.code]], 0);
        const termGpa = termCredits ? termPoints / termCredits : null;
        const forecast = (d.official.gpa * d.official.gpaCredits + termPoints) / (d.official.gpaCredits + termCredits);
        const max = d.policy.scale;
        const targets = [...d.scholarship.categories.map((c) => ({ id: c.id, gpa: c.min_gpa, label: t('gpa.target.category', { d: c.discount, g: c.min_gpa.toFixed(2) }) })), ...d.markers.map((m) => ({ id: m.id, gpa: m.min_gpa, label: l(m.label_en, m.label_ar) }))].sort((a, b) => b.gpa - a.gpa);
        const gap = target != null ? forecast - target : null;
        const state = gap == null ? null : gap >= 0.05 ? 'on_track' : gap >= 0 ? 'close' : 'below';
        const terms: Stage[] = d.official.byTerm.map((x) => ({ key: x.term, label: x.gpa.toFixed(2), meta: l(x.label.en, x.label.ar), state: 'done' }));
        terms.push({ key: 'now', label: termGpa != null ? termGpa.toFixed(2) : '—', meta: l(d.current.label.en, d.current.label.ar), state: 'current' });
        return (
          <div className="space-y-7">
            <p className="max-w-[72ch] text-ink-2">{t('gpa.subtitle')}</p>

            <div className="sheet grid divide-rule overflow-hidden max-sm:divide-y sm:grid-cols-3 sm:divide-x rtl:sm:divide-x-reverse">
              <div className="px-4.5 py-4">
                <p className="t-label flex items-center gap-2">
                  {t('gpa.official')} <Chip tone="green">{t('gpa.kind.official')}</Chip>
                </p>
                <p className="fig mt-2 text-[3.25rem]">{d.official.gpa.toFixed(2)}</p>
                <p className="t-meta mt-1.5">{t('gpa.official.meta', { gpa: d.official.gpaCredits, earned: d.official.earnedCredits })}</p>
              </div>
              <div className="px-4.5 py-4">
                <p className="t-label flex items-center gap-2">
                  {l(d.current.label.en, d.current.label.ar)} <Chip tone="blue">{t('gpa.kind.estimate')}</Chip>
                </p>
                <p className="fig mt-2 text-[3.25rem] text-blue-ink">{termGpa != null ? termGpa.toFixed(2) : '—'}</p>
                <p className="t-meta mt-1.5">{termGpa != null ? t('gpa.thisTerm.meta', { n: estimated.length, total: d.current.courses.length }) : t('gpa.thisTerm.none')}</p>
              </div>
              <div className="px-4.5 py-4" data-tone={state === 'below' ? 'red' : state === 'close' ? 'yellow' : state ? 'green' : undefined}>
                <p className="t-label flex items-center gap-2">
                  {t('gpa.forecast')} {state ? <Chip tone={state === 'below' ? 'red' : state === 'close' ? 'yellow' : 'green'}>{t(`gpa.status.${state}`)}</Chip> : null}
                </p>
                <p className="fig mt-2 text-[3.25rem]">{forecast.toFixed(2)}</p>
                <p className="t-meta mt-1.5">{estimated.length ? t('gpa.basis.term', { n: estimated.length }) : t('gpa.basis.official')}</p>
              </div>
            </div>

            <Sheet title={t('gpa.summary')}>
              <StageLine stages={terms} tone="blue" label={t('gpa.summary')} />
            </Sheet>

            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
              <Sheet flush title={t('gpa.tab.term')}>
                {d.current.courses.length ? (
                  <ul className="rows">
                    {d.current.courses.map((c) => (
                      <li key={c.code} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4.5 py-3">
                        <div className="min-w-0 flex-1 basis-56">
                          <p className="flex items-baseline gap-2">
                            <span className="t-code">{c.code}</span>
                            <span className="truncate font-semibold">{l(c.title_en, c.title_ar)}</span>
                          </p>
                          <p className="t-meta">
                            {c.credits} {t('gpa.cr')}
                          </p>
                        </div>
                        <div role="group" aria-label={t('gpa.final.letter')} className="seg flex-wrap">
                          {letters.map((letter) => (
                            <button key={letter} type="button" aria-pressed={grades[c.code] === letter} onClick={() => setStored(JSON.stringify({ ...grades, [c.code]: grades[c.code] === letter ? '' : letter }))} className="t-code min-w-8 justify-center px-2!">
                              {letter}
                            </button>
                          ))}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-4.5 py-5 text-ink-2">{t('gpa.term.noCourses')}</p>
                )}
                <p className="t-meta border-t border-rule px-4.5 py-3">{t('gpa.notDecision')}</p>
              </Sheet>

              <div className="space-y-6">
                <Sheet title={t('gpa.target')}>
                  <div className="space-y-2">
                    {targets.map((x) => (
                      <button key={x.id} type="button" aria-pressed={target === x.gpa} onClick={() => setTarget(target === x.gpa ? null : x.gpa)} className={cx('flex w-full items-center gap-3 rounded-[10px] border px-3 py-2.5 text-start transition-colors', target === x.gpa ? 'border-ink bg-surface-2' : 'border-rule hover:bg-surface-2')}>
                        <span className="fig w-12 flex-none text-xl">{x.gpa.toFixed(2)}</span>
                        <span className="min-w-0 flex-1 text-[0.8125rem] text-ink-2">{x.label}</span>
                        {forecast >= x.gpa ? <CheckCircle size={17} weight="fill" className="flex-none text-green" /> : null}
                      </button>
                    ))}
                  </div>
                  {target != null && gap != null && state ? (
                    <p className="mt-3 rounded-lg bg-surface-2 px-3 py-2.5">
                      {t(`gpa.nudge.${state}`, { g: forecast.toFixed(2), d: Math.abs(gap).toFixed(2), t: target.toFixed(2), name: t('gpa.target.customName', { g: target.toFixed(2) }) })}
                    </p>
                  ) : null}
                  <p className="t-meta mt-3">{l(d.scholarship.note_en, d.scholarship.note_ar)}</p>
                </Sheet>
                <Sheet title={t('gpa.tab.how')}>
                  <ul className="grid grid-cols-3 gap-x-4 gap-y-1.5">
                    {letters.map((letter) => (
                      <li key={letter} className="flex items-baseline justify-between gap-2 border-b border-rule pb-1">
                        <span className="t-code">{letter}</span>
                        <span className="num text-ink-2">{d.policy.points[letter].toFixed(2)}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="t-meta mt-3">
                    {l(d.policy.name_en, d.policy.name_ar)} · /{max.toFixed(1)}
                  </p>
                  <ul className="mt-2 space-y-1">
                    {d.sources.map((s) => (
                      <li key={s.url}>
                        <a href={s.url} target="_blank" rel="noreferrer" className="link text-[0.8125rem]">
                          {l(s.label_en, s.label_ar)}
                        </a>
                      </li>
                    ))}
                  </ul>
                </Sheet>
              </div>
            </div>
          </div>
        );
      }}
    </Loaded>
  );
}
