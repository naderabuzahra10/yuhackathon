// UniPoints service. The balance is worked out here, from the student's own records read with
// their own session, so a browser cannot claim points it does not have. Vouchers and bonuses are
// kept in this server's store, which lets a second device (the till) redeem them.
import { randomBytes, randomUUID } from 'node:crypto';
import { deriveEntries, EARN, findMenuItem, OUTLETS, readVoucherCode, RECORD_PATHS, voucherCode } from '../shared/rewards.mjs';
import { fail, isStaff, isStudent, readJson, sameOrigin, send } from './backend.mjs';

export function createRewards({ backend, store }) {
  // Earnings change only when the student does something, so a short cache keeps the page quick.
  const earnedCache = new Map();

  async function earnedFor(user, cookie, fresh) {
    const hit = earnedCache.get(user.id);
    if (!fresh && hit && Date.now() - hit.at < 20_000) return hit.entries;
    const names = Object.keys(RECORD_PATHS);
    const values = await Promise.all(names.map((name) => backend.get(RECORD_PATHS[name], cookie).catch(() => null)));
    const entries = deriveEntries(Object.fromEntries(names.map((name, i) => [name, values[i]])));
    earnedCache.set(user.id, { at: Date.now(), entries });
    return entries;
  }

  const vouchersOf = (userId) => store.read().vouchers.filter((v) => v.userId === userId);
  const bonusesOf = (userId) => store.read().bonuses.filter((b) => b.userId === userId);

  function publicVoucher(v) {
    return { id: v.id, code: v.code, outletId: v.outletId, itemId: v.itemId, points: v.points, createdAt: v.createdAt, status: v.status, usedAt: v.usedAt ?? undefined };
  }

  async function account(user, cookie, fresh) {
    const earnedEntries = [
      ...(await earnedFor(user, cookie, fresh)),
      ...bonusesOf(user.id).map((b) => ({ id: `bonus:${b.id}`, kind: b.kind, title_en: b.title_en, title_ar: b.title_ar, points: b.points, at: b.at, link: b.link })),
    ];
    const vouchers = vouchersOf(user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const earned = earnedEntries.reduce((n, e) => n + e.points, 0);
    const spent = vouchers.reduce((n, v) => n + v.points, 0);
    return { earned, spent, balance: earned - spent, earnedEntries, vouchers: vouchers.map(publicVoucher) };
  }

  function describe(v) {
    const hit = findMenuItem(v.itemId);
    return {
      ...publicVoucher(v),
      item: hit ? { name_en: hit.item.name_en, name_ar: hit.item.name_ar, icon: hit.item.icon } : null,
      outlet: hit ? { id: hit.outlet.id, name_en: hit.outlet.name_en, name_ar: hit.outlet.name_ar } : null,
      student: { first_en: v.first_en, first_ar: v.first_ar },
    };
  }

  /** Totals for the staff insights page. */
  function stats() {
    const { vouchers, bonuses } = store.read();
    const byOutlet = OUTLETS.map((o) => {
      const mine = vouchers.filter((v) => v.outletId === o.id);
      return { id: o.id, name_en: o.name_en, name_ar: o.name_ar, color: o.color, issued: mine.length, used: mine.filter((v) => v.status === 'used').length, points: mine.reduce((n, v) => n + v.points, 0) };
    });
    return {
      issued: vouchers.length,
      used: vouchers.filter((v) => v.status === 'used').length,
      pointsSpent: vouchers.reduce((n, v) => n + v.points, 0),
      redeemers: new Set(vouchers.map((v) => v.userId)).size,
      bonusPoints: bonuses.reduce((n, b) => n + b.points, 0),
      byOutlet,
    };
  }

  async function handle(req, res, path) {
    const route = path.split('?')[0];
    const query = new URLSearchParams(path.split('?')[1] ?? '');
    try {
      if (req.method !== 'GET' && !sameOrigin(req)) throw fail(403, 'cross_origin', 'Cross-origin requests are not allowed');
      const user = await backend.userOf(req);
      const cookie = req.headers.cookie ?? '';

      if (route === '/me' && req.method === 'GET') {
        if (!isStudent(user)) throw fail(403, 'not_student', 'UniPoints are for students');
        return send(res, 200, await account(user, cookie, query.get('fresh') === '1'));
      }

      // Just the vouchers: cheap enough to poll while one is on screen, so "used" shows up as the till scans it.
      if (route === '/vouchers' && req.method === 'GET') {
        return send(res, 200, { vouchers: vouchersOf(user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(publicVoucher) });
      }

      if (route === '/redeem' && req.method === 'POST') {
        if (!isStudent(user)) throw fail(403, 'not_student', 'UniPoints are for students');
        const body = await readJson(req);
        const hit = findMenuItem(String(body.itemId ?? ''));
        if (!hit) throw fail(404, 'no_item', 'That item is not on any menu');
        const { balance } = await account(user, cookie, true);
        if (hit.item.points > balance) throw fail(409, 'not_enough_points', `That costs ${hit.item.points} points and the balance is ${balance}`);
        const at = await backend.now();
        const voucher = store.change((state) => {
          let code = voucherCode(hit.outlet.prefix, randomBytes(6));
          while (state.vouchers.some((v) => v.code === code)) code = voucherCode(hit.outlet.prefix, randomBytes(6));
          const v = {
            id: randomUUID(), code, userId: user.id, first_en: String(user.name_en ?? '').split(' ')[0], first_ar: String(user.name_ar ?? '').split(' ')[0],
            outletId: hit.outlet.id, itemId: hit.item.id, points: hit.item.points, createdAt: at, status: 'active',
          };
          state.vouchers.push(v);
          return v;
        });
        return send(res, 201, { voucher: publicVoucher(voucher), balance: balance - hit.item.points });
      }

      // A small bonus for finishing a practice quiz, once per resource.
      if (route === '/bonus' && req.method === 'POST') {
        if (!isStudent(user)) throw fail(403, 'not_student', 'UniPoints are for students');
        const body = await readJson(req);
        if (body.kind !== 'quiz' || typeof body.ref !== 'string' || !body.ref) throw fail(400, 'bad_bonus', 'Unknown bonus');
        const resource = await backend.get(`/campus/resources/${encodeURIComponent(body.ref)}/preview`, cookie).catch(() => null);
        if (!resource) throw fail(404, 'no_resource', 'That resource does not exist');
        const at = await backend.now();
        const result = store.change((state) => {
          if (state.bonuses.some((b) => b.userId === user.id && b.kind === 'quiz' && b.ref === body.ref)) return { awarded: 0 };
          state.bonuses.push({ id: randomUUID(), userId: user.id, kind: 'quiz', ref: body.ref, points: EARN.quiz, title_en: resource.title, title_ar: resource.title, at, link: '/campus/resources' });
          return { awarded: EARN.quiz };
        });
        earnedCache.delete(user.id);
        return send(res, 200, result);
      }

      /* ── The till ── */

      if (route.startsWith('/cashier')) {
        if (!isStaff(user)) throw fail(403, 'not_staff', 'The till is for staff');

        if (route === '/cashier/recent' && req.method === 'GET') {
          const used = store.read().vouchers.filter((v) => v.status === 'used').sort((a, b) => String(b.usedAt).localeCompare(String(a.usedAt)));
          return send(res, 200, { recent: used.slice(0, 12).map(describe), total: used.length, points: used.reduce((n, v) => n + v.points, 0) });
        }

        const body = await readJson(req);
        const code = readVoucherCode(body.code);
        if (!code) throw fail(400, 'bad_code', 'That is not a voucher code');
        const found = store.read().vouchers.find((v) => v.code === code);
        if (!found) throw fail(404, 'no_voucher', 'No voucher has that code');

        if (route === '/cashier/lookup' && req.method === 'POST') return send(res, 200, { voucher: describe(found) });

        if (route === '/cashier/redeem' && req.method === 'POST') {
          const at = await backend.now();
          const done = store.change((state) => {
            const v = state.vouchers.find((x) => x.code === code);
            // Checked again inside the change so two tills cannot both redeem it.
            if (v.status === 'used') return null;
            v.status = 'used';
            v.usedAt = at;
            v.usedBy = user.id;
            return v;
          });
          if (!done) throw fail(409, 'already_used', 'This voucher was already used');
          return send(res, 200, { voucher: describe(done) });
        }
      }

      throw fail(404, 'not_found', 'Not found');
    } catch (e) {
      return send(res, e?.status ?? 500, { error: { code: e?.code ?? 'failed', message: e?.message ?? 'Something went wrong' } });
    }
  }

  return { handle, stats };
}
