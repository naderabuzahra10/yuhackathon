import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { BookBookmark, CalendarBlank, CalendarCheck, ChartLineUp, ClipboardText, ListChecks, SquaresFour, TreeStructure } from '@phosphor-icons/react';
import { useApi } from '@/lib/api';
import { tabId, useFocus } from '@/lib/focus';
import { useTitle } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { NotFoundPage } from '@/pages/System';
import { NavTabs, PageHeader } from '@/ui/kit';
import { AttendancePage, CoursePage, ExcusePage, ExcusesPage, OverviewPage, PlanPage, TimetablePage } from './Core';
import { GpaPage, StudyPage } from './Planning';
import CoachPage from './Coach';
import { RegisterPage } from './Register';

const TITLES: Record<string, string> = {
  plan: 'academics.nav.plan', requirements: 'academics.nav.plan', register: 'academics.nav.register', timetable: 'academics.nav.timetable',
  attendance: 'academics.nav.attendance', excuses: 'academics.nav.excuses', study: 'planner.title', gpa: 'gpa.title',
};

/** The module frame: one header and one row of tabs shared by every academics page. */
function AcademicsLayout() {
  const { t, l } = useI18n();
  const { can } = useSession();
  const focus = useFocus();
  const { pathname } = useLocation();
  const segment = pathname.split('/')[2] ?? '';
  useTitle(t(TITLES[segment] ?? 'nav.academics'));
  const overview = useApi<{ student: { program: { en: string; ar: string } | null; level: number }; term: { label: { en: string; ar: string } } }>('/academics/overview');
  const o = overview.data;
  const tabs = [
    { to: '/academics', label: t('academics.nav.overview'), icon: <SquaresFour size={16} />, end: true, show: true },
    { to: '/academics/plan', label: t('academics.nav.plan'), icon: <TreeStructure size={16} />, show: can('degreePlan') },
    { to: '/academics/register', label: t('academics.nav.register'), icon: <ListChecks size={16} />, show: can('registration') },
    { to: '/academics/timetable', label: t('academics.nav.timetable'), icon: <CalendarBlank size={16} />, show: true },
    { to: '/academics/attendance', label: t('academics.nav.attendance'), icon: <CalendarCheck size={16} />, show: can('attendance') },
    { to: '/academics/excuses', label: t('academics.nav.excuses'), icon: <ClipboardText size={16} />, show: can('attendance') },
    { to: '/academics/study', label: t('academics.nav.study'), icon: <BookBookmark size={16} />, show: can('study') },
    { to: '/academics/gpa', label: t('academics.nav.gpa'), icon: <ChartLineUp size={16} />, show: can('gpa') },
    // Focus trims the row to the tabs that were kept; the tab being read always stays.
  ].filter((x) => x.show && (focus.shows(tabId(x.to)) || (x.to !== '/academics' && pathname.startsWith(x.to))));
  return (
    <div data-tone="blue">
      <PageHeader
        title={t('nav.academics')}
        subtitle={o ? [o.student.program ? l(o.student.program.en, o.student.program.ar) : null, t('academics.overview.level', { level: o.student.level }), l(o.term.label.en, o.term.label.ar)].filter(Boolean).join(' · ') : undefined}
      />
      <NavTabs items={tabs} tone="blue" label={t('nav.academics')} />
      <Outlet />
    </div>
  );
}

export default function AcademicsRoutes() {
  return (
    <Routes>
      <Route element={<AcademicsLayout />}>
        <Route index element={<OverviewPage />} />
        <Route path="plan" element={<PlanPage />} />
        <Route path="requirements" element={<Navigate to="/academics/plan" replace />} />
        <Route path="register" element={<RegisterPage />} />
        <Route path="timetable" element={<TimetablePage />} />
        <Route path="attendance" element={<AttendancePage />} />
        <Route path="excuses" element={<ExcusesPage />} />
        <Route path="study" element={<StudyPage />} />
        <Route path="gpa" element={<GpaPage />} />
      </Route>
      <Route path="excuses/:id" element={<ExcusePage />} />
      <Route path="coach/:id" element={<CoachPage />} />
      <Route path="courses/:code" element={<CoursePage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
