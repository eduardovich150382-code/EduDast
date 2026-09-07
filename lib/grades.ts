/**
 * O'zbekiston umumta'lim maktabi sinflari: 1–11.
 *
 * `User.grades` ga aynan shu raqamlar yoziladi (Int[]). Sinf raqamining
 * ko'rinadigan matni ("7-sinf") messages/*.json da — CLAUDE.md, 1-qoida.
 */
export const GRADES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const;

export const MIN_GRADE = 1;
export const MAX_GRADE = 11;

export type Grade = (typeof GRADES)[number];
