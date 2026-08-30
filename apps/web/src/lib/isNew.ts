/**
 * Returns true when a listing's createdAt timestamp is within the last 7 days.
 */
export const isNew = (createdAt: string | null | undefined): boolean => {
  if (!createdAt) return false;
  const t = new Date(createdAt).getTime();
  return !isNaN(t) && Date.now() - t <= 7 * 24 * 60 * 60 * 1000;
};
