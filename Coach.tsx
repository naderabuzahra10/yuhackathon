import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, ArrowsClockwise, BookOpenText, Brain, CalendarPlus, Cards, Check, CheckCircle, Coins, Sparkle, X, XCircle } from '@phosphor-icons/react';
import { useApi } from '@/lib/api';
import { addRevisionBlocks, type Block, type Card, loadRevisionPlan, type Made, makeCards, makeQuiz, type Question, type RevisionPlan } from '@/lib/coach';
import { useClock } from '@/lib/clock';
import { cx, fmtDate, fmtTime } from '@/lib/format';
import { useTitle } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { useRewards } from '@/lib/rewards';
import { Button, Chip, Empty, Loaded, PageHeader, Segmented, Sheet } from '@/ui/kit';
import { Dialog, toast, useAction } from '@/ui/overlay';
import { Ring } from '@/ui/pass';
import { refreshAll } from '@/lib/api';

/* Practice from a student's own notes: a short quiz with the reason and the paragraph behind each
   answer, or flashcards to flip. Finishing a quiz earns a few UniPoints, once per set of notes. */

interface Preview {
  title: string;
  paragraphs: string[];
}

function sourceLabel(made: Made<unknown>, t: (k: string) => string) {
  if (made.source === 'builtin') return t('coach.builtin');
  const m = /claude-([a-z]+)-(\d+)-(\d+)/.exec(made.model ?? '');
  return m ? `Claude ${m[1][0].toUpperCase()}${m[1].slice(1)} ${m[2]}.${m[3]}` : 'Claude';
}

function Working({ label }: { label: string }) {
  return (
    <Sheet>
      <div className="flex flex-col items-center px-6 py-12 text-center" aria-busy="true">
        <span className="orb size-14" data-busy="true">
          <Sparkle size={26} weight="fill" />
        </span>
        <p className="t-lead mt-4">{label}</p>
      </div>
    </Sheet>
  );
}

function Quiz({ resourceId, preview }: { resourceId: string; preview: Preview }) {
  const { t, locale, rtl } = useI18n();
  const { now } = useClock();
  const rewards = useRewards();
  const [made, setMade] = useState<Made<Question> | null>(null);
  const [round, setRound] = useState(0);
  const [at, setAt] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [bonus, setBonus] = useState(0);
  const Next = rtl ? ArrowLeft : ArrowRight;

  useEffect(() => {
    let live = true;
    setMade(null);
    setAt(0);
    setAnswers([]);
    setBonus(0);
    void makeQuiz(preview.title, preview.paragraphs, locale).then((m) => live && setMade(m));
    return () => {
      live = false;
    };
    // A new round asks for a fresh set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resourceId, round]);

  const questions = made?.items ?? [];
  const q = questions[at];
  const chosen = answers[at];
  const done = made != null && questions.length > 0 && answers.length === questions.length && at >= questions.length;
  const score = answers.filter((a, i) => a === questions[i]?.answer).length;

  const { claimQuiz } = rewards;
  useEffect(() => {
    if (!done || score / questions.length < 0.6) return;
    void claimQuiz(resourceId, preview.title, now).then((n) => {
      if (n) setBonus(n);
    });
    // Claimed once, when the last answer lands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  // 1 to 4 answer, Enter moves on: practice is quicker from the keyboard.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!q || (e.target as HTMLElement).closest('input, textarea, aside')) return;
      const n = Number(e.key);
      if (chosen == null && n >= 1 && n <= q.options.length) setAnswers((a) => [...a, n - 1]);
      else if (chosen != null && e.key === 'Enter') setAt((i) => i + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [q, chosen]);

  if (!made) return <Working label={t('coach.writing')} />;
  if (!questions.length) {
    return (
      <Sheet>
        <Empty icon={<BookOpenText size={24} />} title={t('coach.tooThin')} body={t('coach.tooThinBody')} />
      </Sheet>
    );
  }

  if (done) {
    const missed = questions.map((x, i) => ({ x, i })).filter(({ x, i }) => answers[i] !== x.answer);
    return (
      <div className="space-y-5">
        <section className="plate flex flex-wrap items-center gap-6 p-6 sm:p-8">
          <Ring value={score} max={questions.length} size={112} stroke={11} label={t('coach.score')}>
            <span className="fig text-[1.75rem]">
              {score}/{questions.length}
            </span>
          </Ring>
          <div className="min-w-0 flex-1">
            <h2 className="t-page text-[1.75rem]!">{t(score === questions.length ? 'coach.perfect' : score / questions.length >= 0.6 ? 'coach.good' : 'coach.keepGoing')}</h2>
            <p className="mt-1.5 text-plate-muted">{t('coach.scoreLine', { n: score, total: questions.length })}</p>
            {bonus ? (
              <p className="chip chip-solid mt-3 h-8! px-3.5! text-[0.875rem]!">
                <Coins size={15} weight="fill" />
                {t('rw.gained', { n: bonus })}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => setRound((r) => r + 1)}>
              <ArrowsClockwise size={16} />
              {t('coach.again')}
            </Button>
            <Link to="/campus/resources" className="btn btn-secondary">
              {t('nav.resources')}
            </Link>
          </div>
        </section>
        {missed.length ? (
          <Sheet flush title={t('coach.review')}>
            <ul className="rows">
              {missed.map(({ x, i }) => (
                <li key={i} className="px-5 py-4">
                  <p className="font-semibold" dir="auto">{x.question}</p>
                  <p className="mt-1.5 flex items-start gap-2 text-green-ink">
                    <CheckCircle size={17} weight="fill" className="mt-0.5 flex-none" />
                    <span dir="auto">{x.options[x.answer]}</span>
                  </p>
                  <p className="t-meta mt-1.5" dir="auto">
                    {x.explanation} <span className="t-code">[{x.paragraph}]</span>
                  </p>
                </li>
              ))}
            </ul>
          </Sheet>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <ol className="flex flex-1 gap-1.5" aria-label={t('coach.progress', { n: at + 1, total: questions.length })}>
          {questions.map((x, i) => (
            <li key={i} className={cx('h-1.5 flex-1 rounded-full transition-colors duration-300', i < answers.length ? (answers[i] === x.answer ? 'bg-green' : 'bg-red') : i === at ? 'bg-ink-3' : 'bg-surface-3')} />
          ))}
        </ol>
        <span className="t-code text-[0.8125rem] text-ink-2">
          {at + 1}/{questions.length}
        </span>
        <Chip variant="outline">{sourceLabel(made, t)}</Chip>
      </div>

      <Sheet key={at} className="rise">
        <h2 className="t-page text-[1.375rem]! leading-snug!" dir="auto">
          {q.question}
        </h2>
        <ul className="mt-5 space-y-2.5">
          {q.options.map((option, i) => {
            const right = chosen != null && i === q.answer;
            const wrong = chosen === i && i !== q.answer;
            return (
              <li key={i}>
                <button
                  type="button"
                  disabled={chosen != null}
                  onClick={() => setAnswers((a) => [...a, i])}
                  className={cx(
                    'flex w-full items-center gap-3 rounded-2xl border p-3.5 text-start transition-[background-color,border-color,transform] duration-150 active:scale-[0.99]',
                    right ? 'border-transparent bg-green-tint text-green-ink' : wrong ? 'border-transparent bg-red-tint text-red-ink' : chosen != null ? 'border-rule opacity-60' : 'border-rule-strong hover:bg-surface-2',
                  )}
                >
                  <span className={cx('t-code grid size-8 flex-none place-items-center rounded-full', right ? 'bg-green text-white' : wrong ? 'bg-red text-white' : 'bg-surface-2 text-ink-2')}>
                    {right ? <Check size={15} weight="bold" /> : wrong ? <X size={15} weight="bold" /> : i + 1}
                  </span>
                  <span className="min-w-0 flex-1 font-semibold" dir="auto">{option}</span>
                </button>
              </li>
            );
          })}
        </ul>

        {chosen != null ? (
          <div className="rise mt-5">
            <div className={cx('rounded-2xl p-4', chosen === q.answer ? 'bg-green-tint' : 'bg-surface-2')}>
              <p className={cx('flex items-center gap-2 font-bold', chosen === q.answer ? 'text-green-ink' : 'text-red-ink')}>
                {chosen === q.answer ? <CheckCircle size={18} weight="fill" /> : <XCircle size={18} weight="fill" />}
                {t(chosen === q.answer ? 'coach.right' : 'coach.wrong')}
              </p>
              <p className="mt-1.5" dir="auto">{q.explanation}</p>
              <p className="t-meta mt-2" dir="auto">
                <span className="t-code">[{q.paragraph}]</span> {(preview.paragraphs[q.paragraph - 1] ?? '').slice(0, 220)}
                {(preview.paragraphs[q.paragraph - 1] ?? '').length > 220 ? '…' : ''}
              </p>
            </div>
            <div className="mt-4 flex justify-end">
              <Button variant="primary" size="lg" onClick={() => setAt((i) => i + 1)} autoFocus>
                {t(at + 1 === questions.length ? 'coach.finish' : 'common.next')}
                <Next size={16} weight="bold" />
              </Button>
            </div>
          </div>
        ) : (
          <p className="t-meta mt-4 max-sm:hidden">{t('coach.keys')}</p>
        )}
      </Sheet>
    </div>
  );
}

function Flashcards({ resourceId, preview }: { resourceId: string; preview: Preview }) {
  const { t, locale } = useI18n();
  const [made, setMade] = useState<Made<Card> | null>(null);
  const [queue, setQueue] = useState<number[]>([]);
  const [flipped, setFlipped] = useState(false);
  const [known, setKnown] = useState(0);

  useEffect(() => {
    let live = true;
    setMade(null);
    void makeCards(preview.title, preview.paragraphs, locale).then((m) => {
      if (!live) return;
      setMade(m);
      setQueue(m.items.map((_, i) => i));
      setKnown(0);
      setFlipped(false);
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resourceId]);

  const next = useCallback(
    (gotIt: boolean) => {
      setFlipped(false);
      setQueue((q) => (gotIt ? q.slice(1) : [...q.slice(1), q[0]]));
      if (gotIt) setKnown((n) => n + 1);
    },
    [],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, aside')) return;
      if (e.key === ' ') {
        e.preventDefault();
        setFlipped((f) => !f);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!made) return <Working label={t('coach.writingCards')} />;
  const cards = made.items;
  if (!cards.length) {
    return (
      <Sheet>
        <Empty icon={<BookOpenText size={24} />} title={t('coach.tooThin')} body={t('coach.tooThinBody')} />
      </Sheet>
    );
  }
  if (!queue.length) {
    return (
      <section className="plate flex flex-wrap items-center justify-between gap-5 p-6 sm:p-8">
        <div>
          <h2 className="t-page text-[1.75rem]!">{t('coach.cardsDone')}</h2>
          <p className="mt-1.5 text-plate-muted">{t('coach.cardsDoneBody', { n: cards.length })}</p>
        </div>
        <Button
          variant="primary"
          onClick={() => {
            setQueue(cards.map((_, i) => i));
            setKnown(0);
          }}
        >
          <ArrowsClockwise size={16} />
          {t('coach.again')}
        </Button>
      </section>
    );
  }

  const card = cards[queue[0]];
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
          <div className="h-full rounded-full bg-green transition-[width] duration-500 ease-out" style={{ width: `${(known / cards.length) * 100}%` }} />
        </div>
        <span className="t-code text-[0.8125rem] text-ink-2">
          {known}/{cards.length}
        </span>
        <Chip variant="outline">{sourceLabel(made, t)}</Chip>
      </div>

      <button type="button" onClick={() => setFlipped((f) => !f)} aria-label={t('coach.flip')} className="block w-full [perspective:1400px]">
        <span className={cx('relative block min-h-72 transition-transform duration-500 ease-out [transform-style:preserve-3d]', flipped && '[transform:rotateY(180deg)]')}>
          <span className="plate absolute inset-0 grid place-items-center p-8 text-center [backface-visibility:hidden]">
            <span className="t-page text-[1.5rem]! leading-snug!" dir="auto">{card.front}</span>
          </span>
          <span className="sheet absolute inset-0 grid place-items-center p-8 text-center [backface-visibility:hidden] [transform:rotateY(180deg)]">
            <span>
              <span className="t-lead block leading-relaxed!" dir="auto">{card.back}</span>
              <span className="t-meta mt-3 block">
                <span className="t-code">[{card.paragraph}]</span>
              </span>
            </span>
          </span>
        </span>
      </button>

      {flipped ? (
        <div className="rise grid grid-cols-2 gap-3">
          <Button size="lg" onClick={() => next(false)}>
            <ArrowsClockwise size={17} />
            {t('coach.notYet')}
          </Button>
          <Button size="lg" variant="primary" onClick={() => next(true)}>
            <Check size={17} weight="bold" />
            {t('coach.gotIt')}
          </Button>
        </div>
      ) : (
        <p className="t-meta text-center">{t('coach.flipHint')}</p>
      )}
    </div>
  );
}

export default function CoachPage() {
  const { id = '' } = useParams();
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const mode = params.get('mode') === 'cards' ? 'cards' : 'quiz';
  const q = useApi<Preview>(id ? `/campus/resources/${id}/preview` : null);
  useTitle(q.data ? `${t('coach.title')} · ${q.data.title}` : t('coach.title'));

  return (
    <div data-tone="blue">
      <PageHeader
        crumbs={[{ label: t('nav.resources'), to: '/campus/resources' }, { label: t('coach.title') }]}
        title={q.data?.title ?? t('coach.title')}
        actions={
          <Segmented
            label={t('coach.title')}
            value={mode}
            onChange={(v) => setParams(v === 'cards' ? { mode: 'cards' } : {}, { replace: true })}
            options={[
              { value: 'quiz', label: t('coach.quiz'), icon: <Brain size={15} /> },
              { value: 'cards', label: t('coach.cards'), icon: <Cards size={15} /> },
            ]}
          />
        }
      />
      <Loaded q={q}>
        {(preview) =>
          preview.paragraphs?.length ? (
            mode === 'quiz' ? (
              <Quiz resourceId={id} preview={preview} />
            ) : (
              <Flashcards resourceId={id} preview={preview} />
            )
          ) : (
            <Sheet>
              <Empty icon={<BookOpenText size={24} />} title={t('coach.noText')} body={t('coach.noTextBody')} />
            </Sheet>
          )
        }
      </Loaded>
    </div>
  );
}

/* ── Revision plan, shown on the study planner ── */

export function RevisionPlanner() {
  const { t, locale } = useI18n();
  const [plan, setPlan] = useState<RevisionPlan | null>(null);
  const [open, setOpen] = useState(false);
  const [skip, setSkip] = useState<Set<string>>(new Set());
  const { busy, run } = useAction();

  const build = () =>
    void run('plan', async () => {
      setPlan(await loadRevisionPlan());
      setSkip(new Set());
      setOpen(true);
    });

  const chosen = useMemo(() => (plan?.blocks ?? []).filter((b) => !skip.has(b.key)), [plan, skip]);
  const byDay = useMemo(() => {
    const days = new Map<string, Block[]>();
    for (const b of plan?.blocks ?? []) days.set(b.date, [...(days.get(b.date) ?? []), b]);
    return [...days.entries()];
  }, [plan]);

  const add = () =>
    void run('add', async () => {
      const n = await addRevisionBlocks(chosen);
      refreshAll();
      setOpen(false);
      toast.ok(t('coach.planAdded', { n }));
    });

  return (
    <>
      <section className="plate flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6">
        <div className="min-w-0">
          <h2 className="t-title text-[1.1875rem]!">{t('coach.planTitle')}</h2>
          <p className="mt-1 max-w-[56ch] text-plate-muted">{t('coach.planBody')}</p>
        </div>
        <Button variant="primary" busy={busy === 'plan'} onClick={build}>
          <CalendarPlus size={17} weight="fill" />
          {t('coach.planBuild')}
        </Button>
      </section>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        wide
        title={t('coach.planTitle')}
        subtitle={plan ? t('coach.planFor', { n: plan.assessments.length }) : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" busy={busy === 'add'} disabled={!chosen.length} onClick={add}>
              <Check size={16} weight="bold" />
              {t('coach.planAdd', { n: chosen.length })}
            </Button>
          </>
        }
      >
        {plan && !plan.blocks.length ? (
          <Empty icon={<CheckCircle size={24} weight="fill" />} title={t('coach.planNone')} body={t('coach.planNoneBody')} />
        ) : (
          <div className="space-y-5">
            {byDay.map(([day, blocks]) => (
              <div key={day}>
                <h3 className="t-label mb-2">{fmtDate(day, locale, { weekday: 'long', year: undefined })}</h3>
                <ul className="space-y-2">
                  {blocks.map((b) => {
                    const on = !skip.has(b.key);
                    return (
                      <li key={b.key}>
                        <button
                          type="button"
                          aria-pressed={on}
                          onClick={() =>
                            setSkip((s) => {
                              const next = new Set(s);
                              if (on) next.add(b.key);
                              else next.delete(b.key);
                              return next;
                            })
                          }
                          className={cx('flex w-full items-center gap-3 rounded-2xl border p-3 text-start transition-colors duration-150', on ? 'border-brand-ink bg-brand-tint' : 'border-rule opacity-60')}
                        >
                          <span className={cx('grid size-6 flex-none place-items-center rounded-full', on ? 'bg-brand text-on-brand' : 'bg-surface-3')}>{on ? <Check size={13} weight="bold" /> : null}</span>
                          <span className="t-code w-16 flex-none">{fmtTime(b.time, locale)}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-semibold" dir="auto">{b.forTitle}</span>
                            <span className="t-meta block">
                              {b.course_code ? `${b.course_code} · ` : ''}
                              {t('coach.minutes', { n: b.duration_min })}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
            <p className="t-meta">{t('coach.planNote')}</p>
          </div>
        )}
      </Dialog>
    </>
  );
}
