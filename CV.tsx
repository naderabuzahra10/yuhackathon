import { type CSSProperties, forwardRef, type ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import {
  CalendarCheck, Check, CheckCircle, ClipboardText, EnvelopeSimple, FilePdf, LinkSimple, MapPin, PencilSimple, Phone, Plus, SealCheck, Sparkle, Warning,
} from '@phosphor-icons/react';
import { errorMessage } from '@/lib/api';
import {
  applyPolish, canPolish, contactOf, CV_ACCENTS, CV_LABELS, CV_SECTIONS, type CvAccent, type CvData, cvDates, type CvEntry, type CvLang, type CvOptions, type CvSection,
  type CvTemplate, cvText, hasContent, loadCv, type Polish, polishCv, readCvOptions, saveCvOptions, verifiedCount,
} from '@/lib/cv';
import { cx, initials } from '@/lib/format';
import { useTitle } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { type User, useSession } from '@/lib/session';
import { Button, Chip, ErrorState, Field, PageHeader, PageSkeleton, Segmented, Sheet, Switch } from '@/ui/kit';
import { toast } from '@/ui/overlay';
import '@/styles/cv.css';

/* The CV page. The document is ready on arrival: built from the portfolio, the academic record and
   the digital card, laid out on a sheet of A4 and tightened until it fits one page. The student
   picks a look, hides what they do not want, and saves the PDF. */

type Vars = CSSProperties & Record<`--${string}`, string | number>;

function Seal() {
  return <SealCheck className="cv-seal" weight="fill" aria-hidden />;
}

function Entry({ e, lang, seal }: { e: CvEntry; lang: CvLang; seal: boolean }) {
  const date = cvDates(e, lang);
  const tight = !e.bullets.length;
  return (
    <div className={cx('cv-entry', tight && 'cv-tight')}>
      <div className="cv-entry-top">
        <h3 className="cv-entry-title">
          <span dir="auto">{e.title[lang]}</span>
          {tight && e.org ? <span className="cv-entry-org"> · {e.org[lang]}</span> : null}
          {seal && e.verified ? <Seal /> : null}
        </h3>
        {date ? <span className="cv-date">{date}</span> : null}
      </div>
      {!tight && e.org ? <p className="cv-org">{e.org[lang]}</p> : null}
      {e.bullets.length ? (
        <ul className="cv-bullets">
          {e.bullets.map((b) => (
            <li key={b} dir="auto">
              {b}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="cv-sec">
      <h2 className="cv-h">{label}</h2>
      <div className="cv-body">{children}</div>
    </section>
  );
}

const CvSheet = forwardRef<HTMLDivElement, { cv: CvData; options: CvOptions; className?: string; style?: Vars }>(function CvSheet({ cv, options, className, style }, ref) {
  const lang = options.lang;
  const L = (key: keyof typeof CV_LABELS) => CV_LABELS[key][lang];
  const on = (s: CvSection) => !options.hidden.includes(s) && hasContent(cv, s);
  const seal = options.showVerified;
  const sep = lang === 'ar' ? '، ' : ', ';
  const contact = contactOf(cv, options, lang);
  const ed = cv.education;
  const modern = options.template === 'modern';

  const list = (key: 'experience' | 'projects' | 'awards' | 'volunteering' | 'activities' | 'workshops' | 'certificates') =>
    on(key) ? (
      <Section key={key} label={L(key)}>
        {cv[key].map((e) => (
          <Entry key={e.id} e={e} lang={lang} seal={seal} />
        ))}
      </Section>
    ) : null;

  const summary = on('summary') ? (
    <Section key="summary" label={L('summary')}>
      <p dir="auto">{cv.summary}</p>
    </Section>
  ) : null;

  const education = on('education') ? (
    <Section key="education" label={L('education')}>
      <div className="cv-entry">
        <div className="cv-entry-top">
          <h3 className="cv-entry-title">{ed.degree[lang]}</h3>
          {ed.expected ? <span className="cv-date">{L('expected').replace('{term}', ed.expected[lang])}</span> : null}
        </div>
        <p className="cv-org">{ed.school[lang]}</p>
        {(options.showGpa && ed.gpa != null) || ed.total ? (
          <p className="cv-facts">
            {options.showGpa && ed.gpa != null ? (
              <>
                <b>{L('gpa')}</b> <span dir="ltr">{ed.gpa.toFixed(2)} / 4.00</span>
                {ed.total ? ' · ' : ''}
              </>
            ) : null}
            {ed.total ? L('credits').replace('{a}', String(ed.credits)).replace('{b}', String(ed.total)) : null}
          </p>
        ) : null}
        {ed.coursework.length ? (
          <p className="cv-course">
            <b>{L('coursework')}:</b> {ed.coursework.map((c) => c[lang]).join(sep)}
          </p>
        ) : null}
      </div>
    </Section>
  ) : null;

  const groups = (['core', 'technical', 'professional', 'learning'] as const).filter((g) => cv.skills[g].length);
  const footer = seal && verifiedCount(cv, options.hidden) > 0 ? (
    <p className="cv-foot">
      <Seal />
      {L('verified')}
    </p>
  ) : null;
  const head = (
    <header className="cv-head">
      <div className="cv-id">
        <h1 className="cv-name">{cv.name[lang]}</h1>
        {cv.headline ? (
          <p className="cv-headline" dir="auto">
            {cv.headline}
          </p>
        ) : null}
      </div>
      {modern ? null : (
        <ul className="cv-contact">
          {contact.map((c) => (
            <li key={c.text} dir={c.kind === 'city' ? undefined : 'ltr'}>
              {c.href ? <a href={c.href}>{c.text}</a> : c.text}
            </li>
          ))}
          {cv.availability ? (
            <li>
              <b>{L('available')}:</b> <span dir="auto">{cv.availability}</span>
            </li>
          ) : null}
        </ul>
      )}
    </header>
  );
  const frame = { ref, dir: lang === 'ar' ? ('rtl' as const) : ('ltr' as const), lang, style: { '--cv-accent': CV_ACCENTS[options.accent], ...style } as Vars };

  if (modern) {
    const icon = { city: MapPin, email: EnvelopeSimple, phone: Phone, link: LinkSimple };
    return (
      <div {...frame} className={cx('cv-sheet cv-modern', className)}>
        <aside className="cv-side">
          <div className="cv-mono" aria-hidden>
            {initials(cv.name.en)}
          </div>
          <div className="cv-block">
            <h2 className="cv-h">{L('contact')}</h2>
            <ul className="cv-side-list">
              {contact.map((c) => {
                const Icon = icon[c.kind];
                return (
                  <li key={c.text}>
                    <Icon weight="fill" aria-hidden />
                    <span dir={c.kind === 'city' ? undefined : 'ltr'}>{c.href ? <a href={c.href}>{c.text}</a> : c.text}</span>
                  </li>
                );
              })}
              {cv.availability ? (
                <li>
                  <CalendarCheck weight="fill" aria-hidden />
                  <span dir="auto">{cv.availability}</span>
                </li>
              ) : null}
            </ul>
          </div>
          {on('skills') ? (
            <div className="cv-block">
              <h2 className="cv-h">{L('skills')}</h2>
              {groups.map((g) => (
                <div key={g} className="cv-group">
                  <p className="cv-group-label">{L(g)}</p>
                  <p className="cv-group-list">{cv.skills[g].map((s) => s[lang]).join(sep)}</p>
                </div>
              ))}
            </div>
          ) : null}
          {on('skills') && cv.languages.length ? (
            <div className="cv-block">
              <h2 className="cv-h">{L('languages')}</h2>
              <p className="cv-group-list">{cv.languages.join(sep)}</p>
            </div>
          ) : null}
          {on('activities') ? (
            <div className="cv-block">
              <h2 className="cv-h">{L('activities')}</h2>
              {cv.activities.map((e) => (
                <p key={e.id} className="cv-club">
                  <b>{e.title[lang]}</b>
                  <span className="cv-sub">{[e.org?.[lang], cvDates(e, lang)].filter(Boolean).join(' · ')}</span>
                </p>
              ))}
            </div>
          ) : null}
        </aside>
        <div className="cv-main">
          {head}
          {summary}
          {education}
          {list('experience')}
          {list('projects')}
          {list('awards')}
          {list('volunteering')}
          {list('workshops')}
          {list('certificates')}
          {footer}
        </div>
      </div>
    );
  }

  return (
    <div {...frame} className={cx('cv-sheet cv-classic', className)}>
      {head}
      {summary}
      {education}
      {list('experience')}
      {list('projects')}
      {list('awards')}
      {list('volunteering')}
      {list('activities')}
      {list('workshops')}
      {list('certificates')}
      {on('skills') ? (
        <Section label={L('skills')}>
          <dl className="cv-skills">
            {groups.map((g) => (
              <div key={g} className="cv-row">
                <dt>{L(g)}</dt>
                <dd>{cv.skills[g].map((s) => s[lang]).join(sep)}</dd>
              </div>
            ))}
            {cv.languages.length ? (
              <div className="cv-row">
                <dt>{L('languages')}</dt>
                <dd>{cv.languages.join(sep)}</dd>
              </div>
            ) : null}
          </dl>
        </Section>
      ) : null}
      {footer}
    </div>
  );
});

/** Type sizes tried, largest first, until the sheet fits on one page: a short CV fills its page, a long one tightens. */
const DENSITIES = [1.08, 1.04, 1, 0.96, 0.92, 0.88, 0.84];

interface Fit {
  density: number;
  pages: number;
  /** Layout size of the sheet, before it is scaled into the stage. */
  width: number;
  height: number;
  scale: number;
}

function Builder({ user }: { user: User }) {
  const { t, l } = useI18n();
  const [state, setState] = useState<{ cv?: CvData; error?: unknown }>({});
  const [options, setOptions] = useState<CvOptions>(() => readCvOptions(user.id));
  const [polish, setPolish] = useState<Polish | null>(null);
  const [polishing, setPolishing] = useState(false);
  const [model, setModel] = useState(false);
  const [fit, setFit] = useState<Fit>({ density: 1, pages: 1, width: 794, height: 1123, scale: 1 });
  const sheet = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  useTitle(t('cv.title'));

  const load = useCallback(() => {
    setState({});
    loadCv(user).then(
      (cv) => setState({ cv }),
      (error) => setState({ error }),
    );
  }, [user]);
  useEffect(load, [load]);
  useEffect(() => void canPolish().then(setModel), []);

  const cv = useMemo(() => (state.cv ? applyPolish(state.cv, polish) : null), [state.cv, polish]);
  const update = (patch: Partial<CvOptions>) =>
    setOptions((prev) => {
      const next = { ...prev, ...patch };
      saveCvOptions(user.id, next);
      return next;
    });

  // Tighten the sheet until it fits one page, then scale it into the room there is.
  const refit = useCallback(() => {
    const el = sheet.current;
    const box = stage.current;
    if (!el || !box) return;
    const width = el.offsetWidth;
    // Nothing to measure while the page is hidden or on its way out.
    if (!width || !box.clientWidth) return;
    const page = (width * 297) / 210;
    let density = DENSITIES[0];
    let natural = 0;
    el.style.minHeight = '0';
    for (const d of DENSITIES) {
      density = d;
      el.style.setProperty('--cv-d', String(d));
      natural = el.offsetHeight;
      if (natural <= page + 1) break;
    }
    // Too much for one page even when tight: let it run to a second at a comfortable size instead.
    if (natural > page + 1) {
      density = 0.96;
      el.style.setProperty('--cv-d', String(density));
      natural = el.offsetHeight;
    }
    el.style.minHeight = '';
    const pages = Math.max(1, Math.ceil((natural - 1) / page));
    const next: Fit = { density, pages, width, height: Math.max(natural, page * pages), scale: Math.min(1, box.clientWidth / width) };
    setFit((prev) => (prev.density === next.density && prev.pages === next.pages && prev.width === next.width && Math.abs(prev.height - next.height) < 1 && Math.abs(prev.scale - next.scale) < 0.001 ? prev : next));
  }, []);

  useLayoutEffect(refit, [refit, cv, options]);
  useEffect(() => {
    if (!cv || !stage.current) return;
    const watch = new ResizeObserver(refit);
    watch.observe(stage.current);
    void document.fonts?.ready.then(refit);
    return () => watch.disconnect();
  }, [refit, !!cv]); // eslint-disable-line react-hooks/exhaustive-deps

  if (state.error) return <ErrorState error={state.error} onRetry={load} />;
  if (!cv) return <PageSkeleton />;

  const print = () => {
    const title = document.title;
    const restore = () => {
      document.title = title;
      window.removeEventListener('afterprint', restore);
    };
    // Browsers offer the page title as the file name.
    document.title = `${cv.name[options.lang]} - CV`;
    window.addEventListener('afterprint', restore);
    window.print();
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(cvText(cv, options));
      toast.ok(t('cv.copied'));
    } catch {
      toast.error(t('cv.copyFailed'));
    }
  };

  const improve = async () => {
    if (!state.cv) return;
    setPolishing(true);
    try {
      setPolish(await polishCv(state.cv));
      toast.ok(t('cv.polished'));
    } catch (e) {
      toast.error(`${t('cv.polishFailed')}: ${errorMessage(e)}`);
    } finally {
      setPolishing(false);
    }
  };

  const present = CV_SECTIONS.filter((s) => hasContent(cv, s));
  const missing = ([['experience', 'experience'], ['projects', 'projects'], ['certificates', 'achievements']] as const).filter(([s]) => !hasContent(cv, s));
  const noLinks = !cv.links.length && !options.contact.linkedin.trim() && !options.contact.website.trim();
  const verified = verifiedCount(cv, options.hidden);
  const toggle = (s: CvSection, show: boolean) => update({ hidden: show ? options.hidden.filter((x) => x !== s) : [...options.hidden, s] });
  const setContact = (key: keyof CvOptions['contact'], value: string) => update({ contact: { ...options.contact, [key]: value } });
  const sheetVars: Vars = { '--cv-d': fit.density };

  return (
    <div data-tone="purple">
      <PageHeader
        crumbs={[{ label: t('nav.portfolio'), to: '/portfolio' }, { label: t('cv.crumb') }]}
        title={t('cv.title')}
        subtitle={t('cv.subtitle')}
        actions={
          <>
            <Button variant="primary" size="lg" onClick={print}>
              <FilePdf size={19} weight="fill" />
              {t('cv.save')}
            </Button>
            <Button size="lg" onClick={() => void copy()}>
              <ClipboardText size={18} />
              {t('cv.copy')}
            </Button>
          </>
        }
      />

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_21.5rem]">
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {fit.pages === 1 ? (
              <Chip tone="green">
                <CheckCircle size={14} weight="fill" />
                {t('cv.fit.one')}
              </Chip>
            ) : (
              <Chip tone="yellow">
                <Warning size={14} weight="fill" />
                {t('cv.fit.many', { n: fit.pages })}
              </Chip>
            )}
            {verified ? (
              <Chip tone="purple">
                <SealCheck size={14} weight="fill" />
                {t('cv.verifiedCount', { n: verified })}
              </Chip>
            ) : null}
            {polish ? (
              <Chip tone="brand">
                <Sparkle size={14} weight="fill" />
                {t('cv.polishedChip')}
              </Chip>
            ) : null}
            <p className="t-meta ms-auto max-sm:hidden">{t('cv.saveHint')}</p>
          </div>

          <div className="rounded-[24px] bg-surface-2 p-3 sm:p-6 lg:p-8">
            <div ref={stage} className="cv-stage rise" style={{ height: fit.height * fit.scale }} role="group" aria-label={t('cv.preview', { name: cv.name[options.lang] })}>
              <CvSheet ref={sheet} cv={cv} options={options} style={{ ...sheetVars, '--cv-s': fit.scale }} />
              {Array.from({ length: fit.pages - 1 }, (_, i) => (
                <div key={i} className="cv-break" style={{ top: ((fit.width * 297) / 210) * (i + 1) * fit.scale }}>
                  <span>{t('cv.page', { n: i + 2 })}</span>
                </div>
              ))}
            </div>
          </div>
          {fit.pages > 1 ? <p className="t-meta mt-3">{t('cv.fit.hint')}</p> : null}
          <p className="t-meta mt-3 sm:hidden">{t('cv.saveHint')}</p>
        </div>

        <div className="space-y-4">
          <Sheet title={t('cv.look')}>
            <div className="space-y-4">
              <div>
                <p className="label">{t('cv.template')}</p>
                <Segmented<CvTemplate> label={t('cv.template')} value={options.template} onChange={(template) => update({ template })} options={[{ value: 'classic', label: t('cv.template.classic') }, { value: 'modern', label: t('cv.template.modern') }]} />
              </div>
              <div>
                <p className="label" id="cv-accent">
                  {t('cv.accent')}
                </p>
                <div role="radiogroup" aria-labelledby="cv-accent" className="flex gap-2.5">
                  {(Object.keys(CV_ACCENTS) as CvAccent[]).map((key) => (
                    <button
                      key={key}
                      type="button"
                      role="radio"
                      aria-checked={options.accent === key}
                      aria-label={t(`cv.accent.${key}`)}
                      title={t(`cv.accent.${key}`)}
                      onClick={() => update({ accent: key })}
                      className={cx('grid size-10 place-items-center rounded-full text-white transition-transform duration-150 active:scale-[0.94]', options.accent === key && 'ring-2 ring-ink ring-offset-2 ring-offset-surface')}
                      style={{ background: CV_ACCENTS[key] }}
                    >
                      {options.accent === key ? <Check size={17} weight="bold" /> : null}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="label">{t('cv.lang')}</p>
                <Segmented<CvLang> label={t('cv.lang')} value={options.lang} onChange={(lang) => update({ lang })} options={[{ value: 'en', label: 'English' }, { value: 'ar', label: 'العربية' }]} />
                {options.lang === 'ar' ? <p className="help">{t('cv.langNote')}</p> : null}
              </div>
            </div>
          </Sheet>

          {model ? (
            <Sheet tone="brand">
              <div className="flex items-start gap-3">
                <span className="glyph" data-tone="brand">
                  <Sparkle size={18} weight="fill" />
                </span>
                <div className="min-w-0">
                  <p className="font-semibold">{t('cv.polish')}</p>
                  <p className="t-meta mt-0.5">{t('cv.polishHint')}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" variant="primary" busy={polishing} onClick={() => void improve()}>
                      {t(polish ? 'cv.polishAgain' : 'cv.polishGo')}
                    </Button>
                    {polish ? (
                      <Button size="sm" variant="ghost" onClick={() => setPolish(null)}>
                        {t('cv.polishUndo')}
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            </Sheet>
          ) : null}

          <Sheet title={t('cv.content')}>
            <div className="space-y-3.5">
              {present.map((s) => (
                <Switch key={s} checked={!options.hidden.includes(s)} onChange={(v) => toggle(s, v)} label={l(CV_LABELS[s].en, CV_LABELS[s].ar)} />
              ))}
              <div className="space-y-3.5 border-t border-rule pt-3.5">
                {cv.education.gpa != null ? <Switch checked={options.showGpa} onChange={(showGpa) => update({ showGpa })} label={t('cv.showGpa')} /> : null}
                <Switch checked={options.showVerified} onChange={(showVerified) => update({ showVerified })} label={t('cv.showVerified')} hint={t('cv.showVerifiedHint')} />
              </div>
            </div>
          </Sheet>

          <Sheet title={t('cv.contact')}>
            <div className="space-y-3">
              <Field label={t('cv.email')}>{(p) => <input {...p} className="input" type="email" dir="ltr" autoComplete="email" value={options.contact.email} placeholder={cv.email} onChange={(e) => setContact('email', e.target.value)} />}</Field>
              <Field label={t('cv.phone')} optional>
                {(p) => <input {...p} className="input" type="tel" dir="ltr" autoComplete="tel" value={options.contact.phone} placeholder="+966 5X XXX XXXX" onChange={(e) => setContact('phone', e.target.value)} />}
              </Field>
              <Field label="LinkedIn" optional>
                {(p) => <input {...p} className="input" dir="ltr" value={options.contact.linkedin} placeholder="linkedin.com/in/…" onChange={(e) => setContact('linkedin', e.target.value)} />}
              </Field>
              <Field label={t('cv.website')} optional>
                {(p) => <input {...p} className="input" dir="ltr" value={options.contact.website} placeholder="github.com/…" onChange={(e) => setContact('website', e.target.value)} />}
              </Field>
              <p className="t-meta">{t('cv.contactNote')}</p>
            </div>
          </Sheet>

          {missing.length || noLinks ? (
            <Sheet title={t('cv.missing.title')}>
              <p className="text-ink-2">{t('cv.missing.body')}</p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {missing.map(([s, anchor]) => (
                  <li key={s}>
                    <Link to={`/portfolio#${anchor}`} className="btn btn-tone btn-sm" data-tone="purple">
                      <Plus size={13} weight="bold" />
                      {t(`cv.missing.${s}`)}
                    </Link>
                  </li>
                ))}
                {noLinks ? (
                  <li>
                    <Link to="/portfolio#settings" className="btn btn-tone btn-sm" data-tone="purple">
                      <Plus size={13} weight="bold" />
                      {t('cv.missing.links')}
                    </Link>
                  </li>
                ) : null}
              </ul>
            </Sheet>
          ) : null}

          <div className="px-1">
            <p className="t-meta">{t('cv.sources')}</p>
            <Link to="/portfolio" className="link mt-2 inline-flex items-center gap-1.5 font-semibold">
              <PencilSimple size={14} />
              {t('cv.editPortfolio')}
            </Link>
          </div>
        </div>
      </div>

      {/* What the printer gets: the same sheet at its real size, outside the app's own layout. */}
      {createPortal(
        <div className="cv-print-root" aria-hidden>
          <style>{'@page { size: A4; margin: 0; }'}</style>
          <CvSheet cv={cv} options={options} className={fit.pages === 1 ? 'cv-one' : undefined} style={sheetVars} />
        </div>,
        document.body,
      )}
    </div>
  );
}

export default function CvPage() {
  const { user } = useSession();
  return user ? <Builder key={user.id} user={user} /> : <PageSkeleton />;
}
