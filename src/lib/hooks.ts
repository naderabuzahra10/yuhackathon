import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { useI18n } from './i18n';

export function useTitle(title?: string | null) {
  const { t } = useI18n();
  const app = t('app.name');
  useEffect(() => {
    document.title = title ? `${title} · ${app}` : app;
  }, [title, app]);
}

export type Theme = 'system' | 'light' | 'dark';

function readTheme(): Theme {
  try {
    const v = localStorage.getItem('uj.theme');
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

const themeSubs = new Set<() => void>();

function applyTheme(theme: Theme) {
  const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
}

export function useTheme() {
  const theme = useSyncExternalStore(
    (fn) => {
      themeSubs.add(fn);
      const mq = matchMedia('(prefers-color-scheme: dark)');
      const onSystem = () => applyTheme(readTheme());
      mq.addEventListener('change', onSystem);
      return () => {
        themeSubs.delete(fn);
        mq.removeEventListener('change', onSystem);
      };
    },
    readTheme,
  );
  const setTheme = useCallback((next: Theme) => {
    try {
      localStorage.setItem('uj.theme', next);
    } catch {
      /* private mode */
    }
    applyTheme(next);
    themeSubs.forEach((fn) => fn());
  }, []);
  return { theme, setTheme };
}

export function useIsDark() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  useEffect(() => {
    const obs = new MutationObserver(() => setDark(document.documentElement.classList.contains('dark')));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);
  return dark;
}

export function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (fn) => {
      const mq = matchMedia(query);
      mq.addEventListener('change', fn);
      return () => mq.removeEventListener('change', fn);
    },
    () => matchMedia(query).matches,
  );
}

/** Local state that survives reloads. */
export function useStored<T extends string>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      return (localStorage.getItem(key) as T | null) ?? initial;
    } catch {
      return initial;
    }
  });
  const set = useCallback(
    (next: T) => {
      setValue(next);
      try {
        localStorage.setItem(key, next);
      } catch {
        /* private mode */
      }
    },
    [key],
  );
  return [value, set] as const;
}

export function useDebounced<T>(value: T, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}
