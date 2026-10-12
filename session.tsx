import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, bus, refreshAll } from './api';

export type Role = 'student' | 'applicant' | 'security' | 'reviewer' | 'registrar' | 'admission_officer' | 'club_lead' | 'operator' | 'student_affairs' | 'club_advisor';

export interface User {
  id: string;
  roles: Role[];
  name_en: string;
  name_ar: string;
  email: string;
  student_no: string | null;
  program_id: string | null;
  campus_id: string;
  stage: 'applicant' | 'current' | 'graduating' | 'staff';
  level: number | null;
  avatar_color: string;
  department: string | null;
  interests?: string[];
  skills?: string[];
}

export interface Persona {
  id: string;
  name_en: string;
  name_ar: string;
  roles: Role[];
  stage: User['stage'];
  campus_id: string;
  avatar_color: string;
  program_id: string | null;
  department: string | null;
}

export type Feature =
  | 'today' | 'calendar' | 'approvals' | 'academics' | 'degreePlan' | 'registration' | 'attendance' | 'study' | 'gpa'
  | 'prereqs' | 'resources' | 'campusLife' | 'community' | 'map' | 'lostFound' | 'portfolio' | 'career'
  | 'competitions' | 'journey' | 'feedback' | 'feedbackKpis' | 'studentCard' | 'staff' | 'rewards' | 'assistant' | 'insights' | 'cashier';

const STUDENT: Feature[] = [
  'today', 'calendar', 'approvals', 'academics', 'degreePlan', 'registration', 'attendance', 'study', 'gpa', 'prereqs',
  'resources', 'campusLife', 'community', 'map', 'lostFound', 'portfolio', 'career', 'competitions', 'journey',
  'feedback', 'feedbackKpis', 'studentCard', 'rewards', 'assistant',
];
const STAFF: Feature[] = ['today', 'calendar', 'approvals', 'map', 'staff', 'insights', 'cashier'];

// Mirrors the server's role rules so the menu only shows what will load.
const ACCESS: Partial<Record<Role, Feature[]>> = {
  student: STUDENT,
  applicant: ['today', 'approvals', 'journey', 'prereqs', 'map', 'feedback'],
  security: [...STAFF, 'lostFound'],
  reviewer: [...STAFF, 'prereqs', 'feedbackKpis'],
  registrar: [...STAFF, 'prereqs', 'feedbackKpis'],
  admission_officer: [...STAFF, 'prereqs'],
  club_lead: ['staff', 'campusLife'],
  operator: ['today', 'calendar', 'approvals', 'map', 'insights', 'cashier'],
  student_affairs: ['today', 'insights', 'cashier'],
  club_advisor: ['today', 'map', 'insights', 'cashier'],
};

const ROUTE_FEATURES: Array<[string, Feature]> = [
  ['/academics/register', 'registration'], ['/academics/attendance', 'attendance'], ['/academics/excuses', 'attendance'],
  ['/academics/study', 'study'], ['/academics/coach', 'study'], ['/academics/gpa', 'gpa'], ['/academics/plan', 'degreePlan'],
  ['/academics/requirements', 'degreePlan'], ['/academics', 'academics'], ['/prereqs', 'prereqs'],
  ['/campus/resources', 'resources'], ['/campus/community', 'community'], ['/campus/map', 'map'],
  ['/campus/lost-found', 'lostFound'], ['/campus/card', 'studentCard'], ['/campus/rewards', 'rewards'], ['/campus', 'campusLife'],
  ['/portfolio', 'portfolio'], ['/career', 'career'], ['/competitions', 'competitions'], ['/journey', 'journey'],
  ['/feedback/courses', 'feedbackKpis'], ['/feedback/instructors', 'feedbackKpis'], ['/feedback', 'feedback'],
  ['/staff/insights', 'insights'], ['/cashier', 'cashier'], ['/staff', 'staff'], ['/calendar', 'calendar'], ['/approvals', 'approvals'], ['/today', 'today'],
];

export function featureForPath(path: string): Feature | null {
  for (const [prefix, feature] of ROUTE_FEATURES) {
    if (path === prefix || path.startsWith(`${prefix}/`)) return feature;
  }
  return null;
}

export function homeFor(roles?: Role[]) {
  return roles?.length === 1 && roles[0] === 'applicant' ? '/journey' : '/today';
}

interface Session {
  user: User | null;
  personas: Persona[];
  demoMode: boolean;
  unread: number;
  loading: boolean;
  refresh: () => Promise<void>;
  switchPersona: (id: string) => Promise<void>;
  hasRole: (...roles: Role[]) => boolean;
  can: (feature: Feature) => boolean;
}

const Ctx = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [demoMode, setDemoMode] = useState(true);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const me = await api<{ user: User; demoMode: boolean; unread: number }>('/session/me');
      setUser(me.user);
      setDemoMode(me.demoMode);
      setUnread(me.unread);
      if (me.demoMode) setPersonas(await api<Persona[]>('/session/personas'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    return bus.on('refresh', () => void refresh());
  }, [refresh]);

  const switchPersona = useCallback(async (personaId: string) => {
    await api('/session/switch', { body: { personaId } });
    refreshAll();
  }, []);

  const value = useMemo<Session>(
    () => ({
      user,
      personas,
      demoMode,
      unread,
      loading,
      refresh,
      switchPersona,
      hasRole: (...roles) => !!user && roles.some((r) => user.roles.includes(r)),
      can: (feature) => !!user && user.roles.some((r) => (ACCESS[r] ?? []).includes(feature)),
    }),
    [user, personas, demoMode, unread, loading, refresh, switchPersona],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useSession outside provider');
  return ctx;
}
