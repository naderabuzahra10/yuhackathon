import { lazy, type ReactNode, useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { openStudentCard } from '@/lib/card';
import { I18nProvider } from '@/lib/i18n';
import { featureForPath, homeFor, SessionProvider, useSession } from '@/lib/session';
import { AccessDenied, ApprovalsPage, CalendarPage, NotFoundPage, NotificationsPage } from '@/pages/System';
import TodayPage from '@/pages/Today';
import { PageSkeleton } from '@/ui/kit';
import { Shell } from './Shell';

const AcademicsRoutes = lazy(() => import('@/pages/academics/routes'));
const PrereqsPage = lazy(() => import('@/pages/Prereqs'));
const CampusRoutes = lazy(() => import('@/pages/campus/routes'));
const PortfolioPage = lazy(() => import('@/pages/Portfolio'));
const CvPage = lazy(() => import('@/pages/CV'));
const CareerPage = lazy(() => import('@/pages/Career'));
const CompetitionsPage = lazy(() => import('@/pages/Competitions'));
const JourneyRoutes = lazy(() => import('@/pages/journey/routes'));
const FeedbackRoutes = lazy(() => import('@/pages/Feedback'));
const StaffRoutes = lazy(() => import('@/pages/staff/routes'));
const DemoPanel = lazy(() => import('@/pages/Demo'));
const InsightsPage = lazy(() => import('@/pages/staff/Insights'));
const CashierPage = lazy(() => import('@/pages/Cashier'));
const SettingsPage = lazy(() => import('@/pages/Settings'));

/** Shows a page only when the signed-in role may use it; the server enforces the same rule. */
function Guard({ children }: { children: ReactNode }) {
  const { user, loading, can } = useSession();
  const { pathname } = useLocation();
  if (loading || !user) return <PageSkeleton />;
  const feature = featureForPath(pathname);
  if (feature && !can(feature)) return <AccessDenied path={pathname} />;
  return <>{children}</>;
}

function Home() {
  const { user, loading } = useSession();
  if (loading) return <PageSkeleton />;
  return <Navigate to={homeFor(user?.roles)} replace />;
}

/** The student ID used to be a page; old links to it now open the card over the home page. */
function OpenCard() {
  const { user } = useSession();
  useEffect(() => openStudentCard(), []);
  return <Navigate to={homeFor(user?.roles)} replace />;
}

export function App() {
  return (
    <I18nProvider>
      <SessionProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<Shell />}>
              <Route index element={<Home />} />
              <Route path="today" element={<Guard><TodayPage /></Guard>} />
              <Route path="academics/*" element={<Guard><AcademicsRoutes /></Guard>} />
              <Route path="prereqs" element={<Guard><PrereqsPage /></Guard>} />
              <Route path="prereqs/:programId" element={<Guard><PrereqsPage /></Guard>} />
              <Route path="campus/card" element={<Guard><OpenCard /></Guard>} />
              <Route path="campus/*" element={<Guard><CampusRoutes /></Guard>} />
              <Route path="portfolio" element={<Guard><PortfolioPage /></Guard>} />
              <Route path="portfolio/cv" element={<Guard><CvPage /></Guard>} />
              <Route path="career/*" element={<Guard><CareerPage /></Guard>} />
              <Route path="competitions" element={<Guard><CompetitionsPage /></Guard>} />
              <Route path="journey/*" element={<Guard><JourneyRoutes /></Guard>} />
              <Route path="feedback/*" element={<Guard><FeedbackRoutes /></Guard>} />
              <Route path="staff/insights" element={<Guard><InsightsPage /></Guard>} />
              <Route path="cashier" element={<Guard><CashierPage /></Guard>} />
              <Route path="staff/*" element={<Guard><StaffRoutes /></Guard>} />
              <Route path="demo" element={<Guard><DemoPanel /></Guard>} />
              <Route path="settings" element={<Guard><SettingsPage /></Guard>} />
              <Route path="notifications" element={<Guard><NotificationsPage /></Guard>} />
              <Route path="approvals" element={<Guard><ApprovalsPage /></Guard>} />
              <Route path="calendar" element={<Guard><CalendarPage /></Guard>} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </SessionProvider>
    </I18nProvider>
  );
}
