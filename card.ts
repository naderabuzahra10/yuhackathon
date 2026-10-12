import { useSyncExternalStore } from 'react';

/* The student ID is not a page: it is a card that opens over whatever the student is doing,
   from the account menu in the top bar or from anywhere that calls openStudentCard(). */

let open = false;
const subs = new Set<() => void>();
const emit = () => subs.forEach((fn) => fn());

export function openStudentCard() {
  open = true;
  emit();
}

export function closeStudentCard() {
  open = false;
  emit();
}

export function useStudentCardOpen() {
  return useSyncExternalStore(
    (fn) => {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    () => open,
  );
}
