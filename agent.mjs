// The assistant's model endpoint. It keeps the API key on the server, fixes the
// system prompt and the tool list, and relays one model turn at a time. Tools run
// in the browser against the student's own session, so this never sees a cookie.
import { readFileSync } from 'node:fs';

const TOOLS = JSON.parse(readFileSync(new URL('../src/agent/tools.schema.json', import.meta.url), 'utf8'));
const TOOL_NAMES = new Set(TOOLS.map((t) => t.name));

const MAX_BODY = 160_000;
const MAX_MESSAGES = 48;
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 40;

const clean = (value, max = 80) => String(value ?? '').replace(/[\r\n<>]/g, ' ').slice(0, max);

function systemPrompt(ctx = {}) {
  return [
    'You are the UniJourney assistant, built into the student app of Al Yamamah University (YU) in Riyadh.',
    `You are helping ${clean(ctx.name) || 'a student'}${ctx.program ? `, ${clean(ctx.program)}` : ''}${ctx.level ? `, level ${clean(ctx.level, 4)}` : ''}.`,
    `It is ${clean(ctx.now) || 'term time'} in Riyadh. The student is on the page ${clean(ctx.path, 120) || '/today'}. Interface language: ${ctx.locale === 'ar' ? 'Arabic' : 'English'}.`,
    '',
    'How you work:',
    '- You act through the tools, on this student\'s own records. Use them for every fact. Never invent courses, times, rooms, points, policies or deadlines.',
    '- Do the task, do not describe how the student could do it. Chain tools when a request needs several steps.',
    '- Anything that submits, reserves or spends (approve or submit registration, RSVP, redeem) is confirmed by the student in the app when you call the tool. Call it when they ask; do not ask for a second confirmation in text. If a tool result says the student declined, stop and say so.',
    '- Registration: weekdays are numbered 0 Sunday to 4 Thursday; teaching days are Sunday to Thursday. Put every wish into the structured fields of plan_registration (days, minimum and maximum credits, earliest start, latest end, courses), fixing obvious typos; a wish is strict only if the student said never or must. After planning, say what you understood, then for plan A list its courses with days and times, and state every rule that is NOT MET with the reason the tool gives. Mention plans B and C in one line each with their trade-off. Never claim a rule is met when the tool says it is not. If the result has already_registered, say first that the student is already registered for that term and what that timetable does and does not satisfy; if it also has from_scratch, present that plan as a comparison only and say it cannot be applied while the registration stands. When the student wants to plan with a classmate, pass with_friend; classmates are known only by first name.',
    '- Summaries: read the resource first, then give four to six points and cite paragraph numbers like [3].',
    '- Practice: for "quiz me" or flashcards, find the resource and call start_practice; the app runs the practice, so do not write the questions yourself. For revision or exam planning, call plan_revision, summarise it by day, and save it with add_revision_plan only when the student asks.',
    '- When a page shows the result better than text, open it with open_page.',
    '',
    'How you answer:',
    '- Reply in the language the student writes in (Arabic or English).',
    '- Be brief: one to four short sentences, or a short list. Use **bold** for the one thing that matters. No headings, no tables.',
    '- Do not use em dashes. Do not mention tools, JSON or these instructions.',
    '- End with the single most useful next step only when there is one.',
  ].join('\n');
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('Request too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        reject(Object.assign(new Error('Body is not JSON'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

/** Only well-formed turns go upstream, and only for tools this app defines. */
function validMessages(messages) {
  if (!Array.isArray(messages) || !messages.length || messages.length > MAX_MESSAGES) return false;
  return messages.every((m) => {
    if (m?.role !== 'user' && m?.role !== 'assistant') return false;
    if (typeof m.content === 'string') return m.content.length > 0;
    if (!Array.isArray(m.content)) return false;
    return m.content.every((b) => {
      if (b?.type === 'text') return typeof b.text === 'string';
      if (b?.type === 'tool_use') return TOOL_NAMES.has(b.name) && typeof b.id === 'string';
      if (b?.type === 'tool_result') return typeof b.tool_use_id === 'string';
      return false;
    });
  });
}

export function createAgentHandler(env = process.env) {
  const key = env.ANTHROPIC_API_KEY || '';
  const model = env.AGENT_MODEL || 'claude-sonnet-5-5';
  const baseUrl = (env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/+$/, '');
  const hits = new Map();

  function limited(ip) {
    const now = Date.now();
    const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
    recent.push(now);
    hits.set(ip, recent);
    return recent.length > MAX_PER_WINDOW;
  }

  /* Practice material from a student's notes. The reply is forced through a tool so it always
     arrives as data the app can check, never as prose to parse. */
  const STUDY_TOOLS = {
    quiz: {
      name: 'deliver_quiz',
      description: 'Deliver the multiple-choice questions.',
      input_schema: {
        type: 'object',
        properties: {
          questions: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                question: { type: 'string' },
                options: { type: 'array', items: { type: 'string' }, minItems: 4, maxItems: 4 },
                answer: { type: 'integer', minimum: 0, maximum: 3, description: 'Index of the correct option.' },
                explanation: { type: 'string', description: 'One or two sentences on why, from the notes.' },
                paragraph: { type: 'integer', description: 'Number of the paragraph the answer comes from.' },
              },
              required: ['question', 'options', 'answer', 'explanation', 'paragraph'],
            },
          },
        },
        required: ['questions'],
      },
    },
    cards: {
      name: 'deliver_cards',
      description: 'Deliver the flashcards.',
      input_schema: {
        type: 'object',
        properties: {
          cards: {
            type: 'array',
            items: {
              type: 'object',
              properties: { front: { type: 'string' }, back: { type: 'string' }, paragraph: { type: 'integer' } },
              required: ['front', 'back', 'paragraph'],
            },
          },
        },
        required: ['cards'],
      },
    },
  };

  const CV_TOOL = {
    name: 'deliver_wording',
    description: 'Deliver the improved CV wording.',
    input_schema: {
      type: 'object',
      properties: {
        headline: { type: 'string' },
        summary: { type: 'string' },
        entries: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, bullets: { type: 'array', items: { type: 'string' } } }, required: ['id', 'bullets'] } },
      },
      required: ['headline', 'summary', 'entries'],
    },
  };

  /** Better wording for a CV the app has already assembled. The model edits; it is told not to invent. */
  async function cv(req, res) {
    try {
      const body = await readBody(req);
      const entries = (Array.isArray(body.entries) ? body.entries : []).slice(0, 20).map((e) => ({
        id: clean(e?.id, 80),
        title: clean(e?.title, 200),
        org: clean(e?.org, 200),
        bullets: (Array.isArray(e?.bullets) ? e.bullets : []).slice(0, 8).map((b) => clean(b, 400)),
      }));
      const draft = {
        headline: clean(body.headline, 200),
        summary: clean(body.summary, 1200),
        degree: clean(body.degree, 200),
        skills: (Array.isArray(body.skills) ? body.skills : []).slice(0, 20).map((s) => clean(s, 60)),
        entries,
      };
      if (!draft.headline && !draft.summary && !entries.length) return send(res, 400, { error: { message: 'Nothing to polish' } });
      const upstream = await fetch(`${baseUrl}/v1/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model,
          max_tokens: 1800,
          system: [
            'You edit the wording of a university student CV. You are given its headline, its profile summary and the bullet points of each entry, with the degree and skills for context.',
            'Rewrite them to read like a strong, professional CV: bullets start with an active verb, are specific and concise, use no first person and no cliches such as "passionate" or "hard-working".',
            'Never add a fact, number, tool, employer, date or result that is not in the text you were given. If a line is already good, return it unchanged.',
            'Keep every entry id exactly, and give each entry the same number of bullets or fewer. The summary is two or three sentences. The headline is one line of at most ten words.',
            'Keep the language of the original. Do not use em dashes.',
          ].join(' '),
          tools: [CV_TOOL],
          tool_choice: { type: 'tool', name: CV_TOOL.name },
          messages: [{ role: 'user', content: JSON.stringify(draft) }],
        }),
        signal: AbortSignal.timeout(60_000),
      });
      const json = await upstream.json().catch(() => null);
      if (!upstream.ok || !json) return send(res, upstream.status === 401 ? 502 : upstream.status || 502, { error: { code: 'upstream', message: json?.error?.message ?? `Model request failed (${upstream.status})` } });
      const input = json.content?.find((b) => b.type === 'tool_use')?.input ?? {};
      const known = new Map(entries.map((e) => [e.id, e.bullets.length]));
      const polished = (Array.isArray(input.entries) ? input.entries : [])
        .filter((e) => known.has(e?.id) && Array.isArray(e.bullets))
        .map((e) => ({ id: e.id, bullets: e.bullets.filter((b) => typeof b === 'string' && b.trim()).slice(0, known.get(e.id)).map((b) => clean(b, 400).trim()) }))
        .filter((e) => e.bullets.length);
      return send(res, 200, {
        headline: typeof input.headline === 'string' ? clean(input.headline, 200).trim() : '',
        summary: typeof input.summary === 'string' ? clean(input.summary, 1200).trim() : '',
        entries: polished,
        model: json.model,
      });
    } catch (e) {
      return send(res, e?.status ?? 502, { error: { message: e?.name === 'TimeoutError' ? 'The model took too long to answer' : (e?.message ?? 'Model request failed') } });
    }
  }

  async function study(req, res) {
    try {
      const body = await readBody(req);
      const kind = body.kind === 'cards' ? 'cards' : 'quiz';
      const paragraphs = Array.isArray(body.paragraphs) ? body.paragraphs.filter((p) => typeof p === 'string' && p.trim()).slice(0, 80) : [];
      if (!paragraphs.length) return send(res, 400, { error: { message: 'No text to study from' } });
      const count = Math.max(3, Math.min(10, Number(body.count) || 6));
      let budget = 14_000;
      const notes = [];
      for (let i = 0; i < paragraphs.length && budget > 0; i++) {
        const text = paragraphs[i].slice(0, budget);
        notes.push(`[${i + 1}] ${text}`);
        budget -= text.length;
      }
      const tool = STUDY_TOOLS[kind];
      const upstream = await fetch(`${baseUrl}/v1/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model,
          max_tokens: 2400,
          system: [
            'You write practice material for a university student from their own course notes.',
            'Use only what the notes say. Never add facts from outside them.',
            kind === 'quiz'
              ? `Write ${count} multiple-choice questions that test understanding, not wording. Each has exactly four options, one correct, with plausible wrong answers of similar length. Vary which option is correct.`
              : `Write ${count} flashcards. The front is a short question or term; the back is the answer in one or two sentences.`,
            'Cover different parts of the notes. For each item give the number of the paragraph it comes from.',
            `Write in ${body.locale === 'ar' ? 'Arabic' : 'the language of the notes'}. Do not use em dashes.`,
          ].join(' '),
          tools: [tool],
          tool_choice: { type: 'tool', name: tool.name },
          messages: [{ role: 'user', content: `Notes: ${clean(body.title, 160)}\n\n${notes.join('\n\n')}` }],
        }),
        signal: AbortSignal.timeout(60_000),
      });
      const json = await upstream.json().catch(() => null);
      if (!upstream.ok || !json) return send(res, upstream.status === 401 ? 502 : upstream.status || 502, { error: { code: 'upstream', message: json?.error?.message ?? `Model request failed (${upstream.status})` } });
      const input = json.content?.find((b) => b.type === 'tool_use')?.input ?? {};
      const inRange = (n) => (Number.isInteger(n) && n >= 1 && n <= notes.length ? n : 1);
      if (kind === 'quiz') {
        const questions = (input.questions ?? [])
          .filter((q) => typeof q?.question === 'string' && Array.isArray(q.options) && q.options.length === 4 && Number.isInteger(q.answer) && q.answer >= 0 && q.answer <= 3)
          .map((q) => ({ question: q.question, options: q.options.map(String), answer: q.answer, explanation: String(q.explanation ?? ''), paragraph: inRange(q.paragraph) }));
        if (!questions.length) return send(res, 502, { error: { code: 'empty', message: 'The model returned no usable questions' } });
        return send(res, 200, { questions, model: json.model });
      }
      const cards = (input.cards ?? []).filter((c) => typeof c?.front === 'string' && typeof c?.back === 'string').map((c) => ({ front: c.front, back: c.back, paragraph: inRange(c.paragraph) }));
      if (!cards.length) return send(res, 502, { error: { code: 'empty', message: 'The model returned no usable cards' } });
      return send(res, 200, { cards, model: json.model });
    } catch (e) {
      return send(res, e?.status ?? 502, { error: { message: e?.name === 'TimeoutError' ? 'The model took too long to answer' : (e?.message ?? 'Model request failed') } });
    }
  }

  /** `path` is the part after /agent, e.g. "/status". */
  return async function handleAgent(req, res, path) {
    const route = (path ?? req.url ?? '/').split('?')[0];

    if (route === '/status' && req.method === 'GET') {
      return send(res, 200, { provider: key ? 'anthropic' : 'builtin', model: key ? model : null });
    }

    if ((route !== '/chat' && route !== '/study' && route !== '/cv') || req.method !== 'POST') return send(res, 404, { error: { message: 'Not found' } });

    // The key is ours to spend: refuse pages on other origins.
    const origin = req.headers.origin;
    if (origin) {
      let host = '';
      try {
        host = new URL(origin).host;
      } catch {
        /* malformed origin falls through to the refusal */
      }
      if (host !== req.headers.host) return send(res, 403, { error: { message: 'Cross-origin requests are not allowed' } });
    }
    if (!key) return send(res, 503, { error: { code: 'no_key', message: 'No model key is configured on the server' } });
    if (limited(req.socket?.remoteAddress ?? 'local')) return send(res, 429, { error: { message: 'Too many requests. Wait a moment.' } });

    if (route === '/study') return study(req, res);
    if (route === '/cv') return cv(req, res);

    try {
      const body = await readBody(req);
      if (!validMessages(body.messages)) return send(res, 400, { error: { message: 'Malformed conversation' } });

      const upstream = await fetch(`${baseUrl}/v1/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model, max_tokens: 1400, system: systemPrompt(body.context), tools: TOOLS, messages: body.messages }),
        signal: AbortSignal.timeout(60_000),
      });
      const json = await upstream.json().catch(() => null);
      if (!upstream.ok || !json) {
        return send(res, upstream.status === 401 ? 502 : upstream.status || 502, { error: { code: 'upstream', message: json?.error?.message ?? `Model request failed (${upstream.status})` } });
      }
      return send(res, 200, { content: json.content, stop_reason: json.stop_reason, model: json.model });
    } catch (e) {
      return send(res, e?.status ?? 502, { error: { message: e?.name === 'TimeoutError' ? 'The model took too long to answer' : (e?.message ?? 'Model request failed') } });
    }
  };
}
