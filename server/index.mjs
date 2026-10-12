// Everything this server answers itself, on the same origin as the app and the API proxy:
//   /agent     the assistant's model endpoint and the study coach
//   /rewards   UniPoints: balance, vouchers, the till
//   /insights  the staff overview
import { createAgentHandler } from './agent.mjs';
import { createBackend, send } from './backend.mjs';
import { createInsights } from './insights.mjs';
import { createRewards } from './rewards.mjs';
import { createStore } from './store.mjs';

export const SERVICE_PREFIXES = ['/agent', '/rewards', '/insights'];

export function createServices(env = process.env) {
  const backend = createBackend(env);
  const store = createStore(env);
  const agent = createAgentHandler(env);
  const rewards = createRewards({ backend, store });
  const insights = createInsights({ backend, rewards });
  const routes = { '/agent': agent, '/rewards': rewards.handle, '/insights': insights.handle };

  /** Answers the request if it belongs to a service. `url` is the full path with its query. */
  return function handle(req, res, url = req.url ?? '/') {
    const prefix = SERVICE_PREFIXES.find((p) => url === p || url.startsWith(`${p}/`) || url.startsWith(`${p}?`));
    if (!prefix) return false;
    Promise.resolve(routes[prefix](req, res, url.slice(prefix.length) || '/')).catch((e) => {
      if (!res.headersSent) send(res, 500, { error: { message: e?.message ?? 'Something went wrong' } });
    });
    return true;
  };
}
