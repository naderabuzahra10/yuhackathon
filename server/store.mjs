// A small JSON file store for the services this server owns (UniPoints vouchers and bonuses).
// One process, one file: writes go to a temporary file and are renamed into place.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

export function createStore(env = process.env) {
  const file = resolve(env.UNIJOURNEY_DATA || resolve(here, '..', 'data', 'unijourney.json'));
  let state = { vouchers: [], bonuses: [] };
  try {
    if (existsSync(file)) state = { ...state, ...JSON.parse(readFileSync(file, 'utf8')) };
  } catch {
    // A damaged file is not worth crashing for; start empty and overwrite it on the next change.
  }

  function save() {
    mkdirSync(dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, JSON.stringify(state));
    renameSync(tmp, file);
  }

  return {
    file,
    read: () => state,
    /** Apply a change and persist it. The callback may return a value for the caller. */
    change(fn) {
      const result = fn(state);
      save();
      return result;
    },
  };
}
