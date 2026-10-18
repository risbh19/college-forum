export const BOARDS = [
  { slug: 'general', label: 'General' },
  { slug: 'cse', label: 'CSE' },
  { slug: 'hostel', label: 'Hostel' },
  { slug: 'placements', label: 'Placements' },
  { slug: 'confessions', label: 'Confessions' },
] as const;

export type BoardSlug = (typeof BOARDS)[number]['slug'];
export const BOARD_SLUGS = BOARDS.map((board) => board.slug) as [BoardSlug, ...BoardSlug[]];
