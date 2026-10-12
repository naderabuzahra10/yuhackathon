import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import en from '@/i18n/en.json';
import { extra } from '@/i18n/extra';

export type Locale = 'en' | 'ar';
type Vars = Record<string, string | number | null | undefined>;
type Table = Record<string, string>;

const tables: Record<Locale, Table | null> = { en: { ...(en as Table), ...extra.en }, ar: null };

async function loadTable(locale: Locale): Promise<Table> {
  if (!tables[locale]) tables[locale] = { ...((await import('@/i18n/ar.json')).default as Table), ...extra.ar };
  return tables[locale]!;
}

function savedLocale(): Locale {
  try {
    return localStorage.getItem('uj.locale') === 'ar' ? 'ar' : 'en';
  } catch {
    return 'en';
  }
}

interface I18n {
  locale: Locale;
  dir: 'ltr' | 'rtl';
  rtl: boolean;
  setLocale: (l: Locale) => void;
  /** Translate a key. A numeric variable selects the plural form (`key#one`, `key#other`, …). */
  t: (key: string, vars?: Vars) => string;
  /** True when the key exists, so optional copy can be skipped cleanly. */
  has: (key: string) => boolean;
  /** Pick the Arabic value of a bilingual field when reading Arabic. */
  l: (en?: string | null, ar?: string | null) => string;
}

const Ctx = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [wanted, setWanted] = useState<Locale>(savedLocale);
  // The active locale changes only once its table has loaded, so a string is never read from the wrong table.
  const [active, setActive] = useState<{ locale: Locale; table: Table } | null>(wanted === 'en' ? { locale: 'en', table: tables.en! } : null);

  useEffect(() => {
    let live = true;
    void loadTable(wanted).then((table) => {
      if (!live) return;
      setActive({ locale: wanted, table });
      document.documentElement.lang = wanted;
      document.documentElement.dir = wanted === 'ar' ? 'rtl' : 'ltr';
    });
    return () => {
      live = false;
    };
  }, [wanted]);

  const setLocale = useCallback((next: Locale) => {
    try {
      localStorage.setItem('uj.locale', next);
    } catch {
      /* private mode */
    }
    setWanted(next);
  }, []);

  const value = useMemo<I18n | null>(() => {
    if (!active) return null;
    const { locale, table } = active;
    const plural = new Intl.PluralRules(locale);
    const t = (key: string, vars?: Vars) => {
      let text = table[key] ?? tables.en![key] ?? key;
      if (vars) {
        const n = typeof vars.n === 'number' ? vars.n : Object.values(vars).find((v) => typeof v === 'number');
        if (typeof n === 'number') {
          const form = (n === 0 ? table[`${key}#zero`] : undefined) ?? table[`${key}#${plural.select(n)}`] ?? table[`${key}#other`];
          if (form) text = form;
        }
        for (const [name, v] of Object.entries(vars)) text = text.replaceAll(`{${name}}`, String(v ?? ''));
      }
      return text;
    };
    return {
      locale,
      dir: locale === 'ar' ? 'rtl' : 'ltr',
      rtl: locale === 'ar',
      setLocale,
      t,
      has: (key) => key in table || key in tables.en! || `${key}#other` in table,
      l: (enValue, arValue) => (locale === 'ar' && arValue ? arValue : (enValue ?? '')),
    };
  }, [active, setLocale]);

  if (!value) return null;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useI18n outside provider');
  return ctx;
}
