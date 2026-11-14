import crypto from 'crypto';

/** 16-char temporary password from an unambiguous alphabet, always with a letter and a digit. */
export const generateTemporaryPassword = (): string => {
  const letters = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ';
  const digits = '23456789';
  const all = letters + digits;
  const pick = (set: string) => set[crypto.randomInt(set.length)];
  const chars = [pick(letters), pick(digits), ...Array.from({ length: 14 }, () => pick(all))];
  // Fisher-Yates shuffle so the letter/digit aren't always first
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
};
