import { ArrowCounterClockwise, Briefcase, Check, Confetti, Crosshair, Desktop, Exam, EyeSlash, LockSimple, Moon, Star, Sun, type Icon } from '@phosphor-icons/react';
import { type FocusEntry, type FocusGroup, useFocusCatalog } from '@/app/focusCatalog';
import { type Focus, isLocked, type PresetId, useFocus } from '@/lib/focus';
import { cx } from '@/lib/format';
import { type Theme, useTheme, useTitle } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { Button, Chip, PageHeader, SectionHead, Segmented, Sheet, type Tone } from '@/ui/kit';
import { toast } from '@/ui/overlay';

/* Settings. Most of the page is Focus: the switch in the top bar hides whatever is not marked
   as kept here, so the page lists everything that can be hidden, one switch each, grouped the
   way the app is. Choices apply at once and are remembered on the device. */

const PRESET_LIST: Array<{ id: PresetId; icon: Icon; tone: Tone }> = [
  { id: 'essentials', icon: Star, tone: 'brand' },
  { id: 'exams', icon: Exam, tone: 'blue' },
  { id: 'career', icon: Briefcase, tone: 'purple' },
  { id: 'campus', icon: Confetti, tone: 'orange' },
];

function Track({ on, hero }: { on: boolean; hero?: boolean }) {
  return (
    <span aria-hidden className={cx('relative flex-none rounded-full transition-colors duration-150', hero ? 'h-8 w-14' : 'h-6 w-10.5', on ? (hero ? 'bg-accent' : 'bg-brand') : hero ? 'bg-(--plate-rule)' : 'bg-rule-strong')}>
      <span
        className={cx(
          'absolute top-0.5 rounded-full shadow-sm transition-transform duration-200 ease-out ltr:left-0.5 rtl:right-0.5',
          hero ? 'size-7 bg-white' : 'size-5 bg-surface',
          on && (hero ? 'ltr:translate-x-6 rtl:-translate-x-6' : 'ltr:translate-x-4.5 rtl:-translate-x-4.5'),
        )}
      />
    </span>
  );
}

function ItemRow({ entry, kept, onChange }: { entry: FocusEntry; kept: boolean; onChange: (keep: boolean) => void }) {
  const { t } = useI18n();
  const body = (
    <>
      <span className={cx('glyph transition-opacity duration-150', !kept && 'opacity-40')}>
        <entry.icon size={18} weight={kept ? 'fill' : 'regular'} />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cx('block font-semibold transition-colors duration-150', !kept && 'text-ink-2')}>{entry.label}</span>
        <span className="t-meta block">{entry.hint}</span>
      </span>
    </>
  );
  if (entry.locked) {
    return (
      <div className="row">
        {body}
        <Chip variant="outline">
          <LockSimple size={12} weight="fill" />
          {t('focus.locked')}
        </Chip>
      </div>
    );
  }
  return (
    <button type="button" role="switch" aria-checked={kept} onClick={() => onChange(!kept)} className="row transition-colors duration-150 hover:bg-surface-2">
      {body}
      <Track on={kept} />
    </button>
  );
}

function Group({ group, focus }: { group: FocusGroup; focus: Focus }) {
  const { t } = useI18n();
  const free = group.ids.filter((id) => !isLocked(id));
  const kept = group.ids.filter(focus.kept).length;
  return (
    <section id={`focus-${group.id}`} className="sheet scroll-mt-24 overflow-hidden" data-tone={group.tone}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5 px-5 pt-4 pb-3.5">
        <div className="min-w-0 flex-1 basis-60">
          <h3 className="t-title flex flex-wrap items-center gap-2">
            {group.title}
            <span className="chip num" data-tone={kept === group.ids.length ? 'green' : 'neutral'}>
              {t('focus.kept', { a: kept, b: group.ids.length })}
            </span>
          </h3>
          <p className="t-meta mt-0.5">{group.hint}</p>
        </div>
        <div className="flex gap-1.5">
          <Button size="sm" disabled={free.every(focus.kept)} onClick={() => focus.set(free, true)}>
            {t('focus.all')}
          </Button>
          <Button size="sm" disabled={!free.some(focus.kept)} onClick={() => focus.set(free, false)}>
            {t('focus.none')}
          </Button>
        </div>
      </div>
      {group.sections.map((section) => {
        const ids = section.entries.filter((e) => !e.locked).map((e) => e.id);
        const all = ids.every(focus.kept);
        return (
          <div key={section.key} data-tone={section.tone}>
            {section.title ? (
              <div className="flex items-center justify-between gap-3 border-t border-rule bg-surface-2 px-5 py-1.5">
                <p className="t-label text-tone-ink!">{section.title}</p>
                {ids.length > 1 ? (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => focus.set(ids, !all)}>
                    {t(all ? 'focus.sectionNone' : 'focus.sectionAll')}
                  </button>
                ) : null}
              </div>
            ) : null}
            <ul className="rows border-t border-rule">
              {section.entries.map((entry) => (
                <li key={entry.id}>
                  <ItemRow entry={entry} kept={focus.kept(entry.id)} onChange={(keep) => focus.set([entry.id], keep)} />
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}

export default function SettingsPage() {
  const { t, locale, setLocale } = useI18n();
  const { can } = useSession();
  const focus = useFocus();
  const catalog = useFocusCatalog();
  const { theme, setTheme } = useTheme();
  useTitle(t('set.title'));

  const student = can('academics');
  const hidden = catalog.ids.filter((id) => !focus.kept(id)).length;
  const preset = student ? PRESET_LIST.find((p) => focus.matches(p.id, catalog.ids)) : undefined;
  const menu = catalog.groups[0];

  return (
    <div data-tone="brand">
      <PageHeader
        title={t('set.title')}
        subtitle={t('set.subtitle')}
        actions={
          <Button
            disabled={!focus.changed}
            onClick={() => {
              focus.reset();
              toast.ok(t('focus.resetDone'));
            }}
          >
            <ArrowCounterClockwise size={16} />
            {t('focus.reset')}
          </Button>
        }
      />

      <section className="plate rise px-5 py-6 sm:px-7 sm:py-7">
        <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-5">
          <div className="min-w-0 max-w-[58ch]">
            <p className="t-label flex items-center gap-2">
              <Crosshair size={15} weight="fill" />
              {t('focus.title')}
            </p>
            <h2 className="t-page mt-2">{focus.on ? t('focus.heroOn', { n: hidden }) : t('focus.heroOff')}</h2>
            <p className="mt-2 text-plate-muted">{t('focus.body')}</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={focus.on}
            aria-label={t('focus.title')}
            onClick={() => focus.setOn(!focus.on)}
            className="flex flex-none items-center gap-3 rounded-full bg-plate-2 py-1.5 ps-5 pe-1.5 text-[1.0625rem] font-bold transition-transform duration-150 active:scale-[0.97]"
          >
            {t(focus.on ? 'focus.stateOn' : 'focus.stateOff')}
            <Track on={focus.on} hero />
          </button>
        </div>
        <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-plate-rule pt-5 sm:grid-cols-3 lg:grid-cols-5">
          {catalog.groups.map((g) => (
            <div key={g.id}>
              <dt className="t-label">{g.title}</dt>
              <dd className="mt-1 flex items-baseline gap-1.5">
                <span className="fig text-[1.75rem]">{g.ids.filter(focus.kept).length}</span>
                <span className="num text-plate-muted">/ {g.ids.length}</span>
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <nav aria-label={t('focus.jump')} className="scroll-x -mx-1 mt-5 flex gap-2 px-1">
        {catalog.groups.map((g) => (
          <a key={g.id} href={`#focus-${g.id}`} className="pick flex-none">
            {g.title}
            <span className="num text-ink-3">
              {g.ids.filter(focus.kept).length}/{g.ids.length}
            </span>
          </a>
        ))}
      </nav>

      <div className="mt-7 grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_20.5rem]">
        <div className="min-w-0 space-y-6">
          {student ? (
            <section>
              <SectionHead title={t('focus.presets')} hint={t('focus.presetsHint')} />
              <div className="grid gap-3 sm:grid-cols-2">
                {PRESET_LIST.map((p) => {
                  const active = preset?.id === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      aria-pressed={active}
                      data-tone={p.tone}
                      onClick={() => focus.applyPreset(p.id, catalog.ids)}
                      className={cx('sheet lift flex items-start gap-3 p-4 text-start', active && 'shadow-[inset_0_0_0_2px_var(--tone)]')}
                    >
                      <span className="glyph">
                        <p.icon size={19} weight="fill" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2 font-bold">
                          {t(`focus.preset.${p.id}`)}
                          {active ? (
                            <span className="chip chip-solid">
                              <Check size={11} weight="bold" />
                              {t('focus.presetActive')}
                            </span>
                          ) : null}
                        </span>
                        <span className="t-meta mt-0.5 block">{t(`focus.preset.${p.id}Hint`)}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
              {preset ? null : <p className="t-meta mt-2.5">{t('focus.custom')}</p>}
            </section>
          ) : null}

          {focus.on ? null : (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[20px] bg-yellow-tint px-5 py-3.5 text-yellow-ink">
              <EyeSlash size={19} weight="fill" className="flex-none" />
              <p className="min-w-0 flex-1 basis-64 font-medium">{t('focus.offNote')}</p>
              <Button size="sm" variant="primary" onClick={() => focus.setOn(true)}>
                {t('focus.turnOn')}
              </Button>
            </div>
          )}

          {catalog.groups.map((group) => (
            <Group key={group.id} group={group} focus={focus} />
          ))}
        </div>

        <div className="space-y-5 xl:sticky xl:top-[calc(var(--topbar-h)+0.75rem)]">
          <Sheet title={t('focus.preview')}>
            <p className="t-meta -mt-1 mb-3">{t('focus.previewHint')}</p>
            <div className="space-y-3 rounded-2xl bg-surface-2 p-2.5">
              {menu.sections.map((section) => {
                const shown = section.entries.filter((e) => focus.kept(e.id));
                if (!shown.length) return null;
                return (
                  <div key={section.key} data-tone={section.tone}>
                    {section.title ? <p className="t-label mb-0.5 px-2">{section.title}</p> : null}
                    <ul>
                      {shown.map((e) => (
                        <li key={e.id} className="flex h-8 items-center gap-2.5 rounded-lg px-2 text-[0.875rem] font-medium">
                          <e.icon size={17} className={section.tone === 'neutral' ? 'text-ink-2' : 'text-tone'} />
                          <span className="truncate">{e.label}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
            <p className="t-meta mt-3">{t('focus.previewCount', { a: menu.ids.filter(focus.kept).length, b: menu.ids.length })}</p>
          </Sheet>

          <Sheet title={t('set.general')}>
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">{t('shell.theme')}</span>
                <Segmented<Theme>
                  label={t('shell.theme')}
                  value={theme}
                  onChange={setTheme}
                  options={[
                    { value: 'system', label: t('shell.theme.system'), icon: <Desktop size={15} /> },
                    { value: 'light', label: t('shell.theme.light'), icon: <Sun size={15} /> },
                    { value: 'dark', label: t('shell.theme.dark'), icon: <Moon size={15} /> },
                  ]}
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">{t('shell.languageLabel')}</span>
                <Segmented label={t('shell.languageLabel')} value={locale} onChange={setLocale} options={[{ value: 'en', label: 'English' }, { value: 'ar', label: 'العربية' }]} />
              </div>
            </div>
          </Sheet>
          <p className="t-meta px-1">{t('set.deviceNote')}</p>
        </div>
      </div>
    </div>
  );
}
