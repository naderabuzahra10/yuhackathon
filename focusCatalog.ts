import { useMemo } from 'react';
import {
  BookBookmark, CalendarBlank, CalendarCheck, ChartLineUp, ChatsCircle, ClipboardText, Clock, Coins, Compass, Flask, Lightning, ListChecks, QrCode, Sparkle,
  SquaresFour, Star, Translate, Tray, TreeStructure, UsersThree, type Icon,
} from '@phosphor-icons/react';
import { BAR_ITEMS, CAMPUS_ITEMS, type FocusDef, type FocusGroupId, isLocked, pageId, TAB_ITEMS, TODAY_ITEMS } from '@/lib/focus';
import { useI18n } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import type { Tone } from '@/ui/kit';
import { navLines } from './nav';

/* Everything Focus can hide for the signed-in account, in the order Settings lists it: the pages
   of the menu, then the blocks and tabs inside the busiest pages, then the top bar. */

export interface FocusEntry {
  id: string;
  label: string;
  hint: string;
  icon: Icon;
  tone: Tone;
  locked: boolean;
}

export interface FocusSection {
  key: string;
  title: string | null;
  tone: Tone;
  entries: FocusEntry[];
}

export interface FocusGroup {
  id: FocusGroupId;
  title: string;
  hint: string;
  tone: Tone;
  sections: FocusSection[];
  ids: string[];
}

const ICONS: Record<string, Icon> = {
  'today:ask': Sparkle, 'today:next': Clock, 'today:points': Coins, 'today:shortcuts': Lightning, 'today:inbox': Tray, 'today:forYou': Star,
  'tab:/academics': SquaresFour, 'tab:/academics/plan': TreeStructure, 'tab:/academics/register': ListChecks, 'tab:/academics/timetable': CalendarBlank,
  'tab:/academics/attendance': CalendarCheck, 'tab:/academics/excuses': ClipboardText, 'tab:/academics/study': BookBookmark, 'tab:/academics/gpa': ChartLineUp,
  'campus:community': ChatsCircle, 'campus:events': CalendarBlank, 'campus:clubs': UsersThree, 'campus:discover': Compass,
  'bar:points': Coins, 'bar:scan': QrCode, 'bar:language': Translate, 'bar:demo': Flask,
};

export function useFocusCatalog(): { groups: FocusGroup[]; ids: string[] } {
  const { t } = useI18n();
  const { can, demoMode } = useSession();
  return useMemo(() => {
    const student = can('academics');
    const available = (def: FocusDef) => {
      if (def.cap && !can(def.cap)) return false;
      if (def.id === 'bar:demo') return demoMode;
      if (def.id === 'bar:scan') return can('campusLife') || can('cashier');
      return true;
    };
    const entry = (tone: Tone) => (def: FocusDef): FocusEntry => ({
      id: def.id,
      // Staff see the same two blocks on Today under their own names.
      label: t(!student && def.id === 'today:inbox' ? 'today.queues' : !student && def.id === 'today:forYou' ? 'today.tools' : def.label),
      hint: t(def.hint),
      icon: ICONS[def.id] ?? Star,
      tone,
      locked: isLocked(def.id),
    });
    const flat = (id: FocusGroupId, tone: Tone, defs: FocusDef[]): FocusGroup | null => {
      const entries = defs.filter(available).map(entry(tone));
      if (!entries.length) return null;
      return { id, title: t(`focus.g.${id}`), hint: t(`focus.g.${id}Hint`), tone, sections: [{ key: id, title: null, tone, entries }], ids: entries.map((e) => e.id) };
    };

    const sections: FocusSection[] = navLines(can, demoMode).map((line) => ({
      key: line.key ?? 'home',
      title: line.key ? t(line.key) : null,
      tone: line.tone,
      entries: line.items.map((item) => ({ id: pageId(item.to), label: t(item.key), hint: t(item.key.replace('nav.', 'focus.h.')), icon: item.icon, tone: line.tone, locked: isLocked(pageId(item.to)) })),
    }));
    const pages: FocusGroup = { id: 'pages', title: t('focus.g.pages'), hint: t('focus.g.pagesHint'), tone: 'brand', sections, ids: sections.flatMap((s) => s.entries.map((e) => e.id)) };

    const groups = [
      pages,
      flat('today', 'brand', TODAY_ITEMS),
      student ? flat('academics', 'blue', TAB_ITEMS) : null,
      can('campusLife') ? flat('campus', 'orange', CAMPUS_ITEMS) : null,
      flat('bar', 'neutral', BAR_ITEMS),
    ].filter((g): g is FocusGroup => !!g);
    return { groups, ids: groups.flatMap((g) => g.ids) };
  }, [t, can, demoMode]);
}
