// University insights for staff: who may need a check-in, how campus life is doing, what the
// feedback says, and how UniPoints are used.
//
// The API has no aggregate feed, so the student part is built from each student persona's own
// records, read through the demo persona switch. That works only in demo mode and covers only the
// synthetic personas; a real deployment would replace readStudents() with a registrar feed.
import { fail, isStaff, send } from './backend.mjs';

const DAY = 24 * 60 * 60 * 1000;

function riskOf(s) {
  const reasons = [];
  let score = 0;
  const worst = s.courses.reduce((a, c) => (c.absence_percent > (a?.absence_percent ?? -1) ? c : a), null);
  if (worst && worst.absence_percent >= s.denial) {
    score += 4;
    reasons.push({ key: 'denial', tone: 'red', en: `${worst.course_code}: ${worst.absence_percent}% absent, at the denial limit`, ar: `${worst.course_code}: غياب ${worst.absence_percent}%، عند حد الحرمان` });
  } else if (worst && worst.absence_percent >= s.warning) {
    score += 3;
    reasons.push({ key: 'warning', tone: 'red', en: `${worst.course_code}: ${worst.absence_percent}% absent, past the warning`, ar: `${worst.course_code}: غياب ${worst.absence_percent}%، تجاوز حد الإنذار` });
  } else if (worst && worst.absence_percent >= s.warning * 0.6) {
    score += 1;
    reasons.push({ key: 'near', tone: 'yellow', en: `${worst.course_code}: ${worst.absence_percent}% absent, nearing the warning`, ar: `${worst.course_code}: غياب ${worst.absence_percent}%، يقترب من الإنذار` });
  }
  if (s.unexcused >= 2) {
    score += 2;
    reasons.push({ key: 'unexcused', tone: 'red', en: `${s.unexcused} absences not excused yet`, ar: `${s.unexcused} غيابات بلا عذر حتى الآن` });
  } else if (s.unexcused === 1) {
    score += 1;
    reasons.push({ key: 'unexcused', tone: 'yellow', en: '1 absence not excused yet', ar: 'غياب واحد بلا عذر حتى الآن' });
  }
  if (s.overdue >= 3) {
    score += 2;
    reasons.push({ key: 'overdue', tone: 'red', en: `${s.overdue} study tasks overdue`, ar: `${s.overdue} مهام دراسية متأخرة` });
  } else if (s.overdue >= 1) {
    score += 1;
    reasons.push({ key: 'overdue', tone: 'yellow', en: `${s.overdue} study task${s.overdue > 1 ? 's' : ''} overdue`, ar: `${s.overdue} مهمة دراسية متأخرة` });
  }
  if (s.gpa != null && s.gpa < 2) {
    score += 4;
    reasons.push({ key: 'gpa', tone: 'red', en: `GPA ${s.gpa.toFixed(2)}, below 2.00`, ar: `المعدل ${s.gpa.toFixed(2)}، أقل من 2.00` });
  } else if (s.gpaDrop != null && s.gpaDrop >= 0.3) {
    score += 2;
    reasons.push({ key: 'drop', tone: 'yellow', en: `Term GPA fell by ${s.gpaDrop.toFixed(2)}`, ar: `انخفض المعدل الفصلي ${s.gpaDrop.toFixed(2)}` });
  }
  if (s.upcomingAssessments >= 3 && s.overdue >= 1) {
    score += 1;
    reasons.push({ key: 'load', tone: 'yellow', en: `${s.upcomingAssessments} assessments in the next two weeks`, ar: `${s.upcomingAssessments} تقييمات خلال أسبوعين` });
  }
  return { score, risk: score >= 4 ? 'high' : score >= 2 ? 'watch' : 'ok', reasons };
}

export function createInsights({ backend, rewards }) {
  let cache = { at: 0, value: null };

  async function readStudents() {
    const anon = await backend.cookieFor('u_student');
    if (!anon) return { available: false, students: [] };
    const personas = await backend.get('/session/personas', anon).catch(() => null);
    const list = (personas?.personas ?? personas ?? []).filter((p) => p.roles?.includes('student'));
    const students = await Promise.all(
      list.map(async (p) => {
        const cookie = await backend.cookieFor(p.id);
        if (!cookie) return null;
        const [today, attendance, gpa, planner] = await Promise.all([
          backend.get('/today', cookie).catch(() => null),
          backend.get('/academics/attendance', cookie).catch(() => null),
          backend.get('/academics/gpa', cookie).catch(() => null),
          backend.get('/academics/planner', cookie).catch(() => null),
        ]);
        if (!today) return null;
        const terms = gpa?.official?.byTerm ?? [];
        const last = terms[terms.length - 1]?.gpa;
        const before = terms[terms.length - 2]?.gpa;
        const now = new Date(today.now).getTime();
        const base = {
          id: p.id,
          name_en: p.name_en,
          name_ar: p.name_ar,
          avatar_color: p.avatar_color,
          program: today.user?.program ?? null,
          year: today.user?.level ?? null,
          stage: p.stage,
          courses: (attendance?.courses ?? []).map((c) => ({ course_code: c.course_code, absence_percent: c.absence_percent, level: c.level })),
          warning: attendance?.policy?.warning?.value ?? 15,
          denial: attendance?.policy?.denial?.value ?? 25,
          unexcused: today.stats?.unexcusedAbsences ?? 0,
          overdue: today.stats?.overdueTasks ?? 0,
          gpa: gpa?.official?.gpa ?? null,
          gpaDrop: last != null && before != null ? Math.max(0, before - last) : null,
          upcomingAssessments: (planner?.items ?? []).filter((i) => i.kind === 'assessment' && !i.done && i.date && new Date(i.date).getTime() - now < 14 * DAY && new Date(i.date).getTime() >= now - DAY).length,
          creditsEarned: today.stats?.creditsEarned ?? 0,
        };
        const worst = base.courses.reduce((n, c) => Math.max(n, c.absence_percent), 0);
        return { ...base, worstAbsence: worst, ...riskOf(base) };
      }),
    );
    return { available: true, students: students.filter(Boolean).sort((a, b) => b.score - a.score) };
  }

  async function readCampus() {
    const cookie = await backend.cookieFor('u_student');
    const [events, clubs] = await Promise.all([backend.get('/campus/events', cookie ?? '').catch(() => []), backend.get('/campus/clubs', cookie ?? '').catch(() => [])]);
    const withSeats = events.filter((e) => e.capacity > 0);
    const upcoming = events.filter((e) => !e.is_past);
    return {
      events: {
        total: events.length,
        upcoming: upcoming.length,
        seats: withSeats.reduce((n, e) => n + e.capacity, 0),
        going: withSeats.reduce((n, e) => n + e.going_count, 0),
        top: upcoming
          .filter((e) => e.capacity > 0)
          .sort((a, b) => b.going_count / b.capacity - a.going_count / a.capacity)
          .slice(0, 6)
          .map((e) => ({ id: e.id, title_en: e.title_en, title_ar: e.title_ar, start_at: e.start_at, going: e.going_count, capacity: e.capacity, club_en: e.club?.name_en ?? null })),
      },
      clubs: {
        total: clubs.length,
        members: clubs.reduce((n, c) => n + (c.member_count ?? 0), 0),
        pending: clubs.reduce((n, c) => n + (c.pending_count ?? 0), 0),
        top: [...clubs].sort((a, b) => (b.member_count ?? 0) - (a.member_count ?? 0)).slice(0, 6).map((c) => ({ id: c.id, name_en: c.name_en, name_ar: c.name_ar, color: c.color, members: c.member_count ?? 0, events: c.upcoming_events ?? 0, posts: c.posts_this_week ?? 0 })),
      },
    };
  }

  /** What this viewer's own role lets them see: read with their session, skipped when the API refuses. */
  async function readDesks(cookie) {
    const attempt = (path) => backend.get(path, cookie).catch(() => null);
    const [feedback, excuses, admissions, graduation] = await Promise.all([attempt('/feedback/staff/overview'), attempt('/academics/review/excuses'), attempt('/admission/review/applications'), attempt('/graduation/review/requests')]);
    const countBy = (list, key = 'status') => (Array.isArray(list) ? list.reduce((acc, x) => ({ ...acc, [x[key]]: (acc[x[key]] ?? 0) + 1 }), {}) : null);
    return {
      feedback: feedback
        ? {
            byCollege: feedback.by_college ?? [],
            courseAlerts: (feedback.course_alerts ?? []).slice(0, 6),
            instructorAlerts: (feedback.alerts ?? []).slice(0, 4),
            held: feedback.held ?? 0,
            ticketsOpen: feedback.tickets_open ?? 0,
          }
        : null,
      excuses: Array.isArray(excuses) ? { waiting: excuses.length } : null,
      admissions: countBy(admissions?.items ?? admissions),
      graduation: countBy(graduation?.items ?? graduation),
    };
  }

  async function handle(req, res, path) {
    try {
      if (path.split('?')[0] !== '/overview' || req.method !== 'GET') throw fail(404, 'not_found', 'Not found');
      const user = await backend.userOf(req);
      if (!isStaff(user)) throw fail(403, 'not_staff', 'Insights are for staff');
      if (!cache.value || Date.now() - cache.at > 45_000) {
        const [people, campus, now] = await Promise.all([readStudents(), readCampus(), backend.now()]);
        cache = { at: Date.now(), value: { generatedAt: now, people, campus } };
      }
      const desks = await readDesks(req.headers.cookie ?? '');
      return send(res, 200, { ...cache.value, desks, points: rewards.stats() });
    } catch (e) {
      return send(res, e?.status ?? 500, { error: { code: e?.code ?? 'failed', message: e?.message ?? 'Something went wrong' } });
    }
  }

  return { handle };
}
