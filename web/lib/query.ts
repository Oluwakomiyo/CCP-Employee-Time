/**
 * placeholderData that keeps the previous result only while the subject (the id at
 * queryKey[2]) is the same: a new date range shows the old numbers dimmed, but a
 * different person or project shows a loading state instead of someone else's numbers.
 */
export const keepForSameSubject =
  (id: string) =>
  <T,>(previous: T | undefined, previousQuery?: { queryKey: readonly unknown[] }) =>
    previousQuery?.queryKey[2] === id ? previous : undefined;
