import { describe, expect, it } from 'vitest';
import {
  filterComments,
  validateCommentCitations,
  type StoredComment,
} from './comments';
const rows: StoredComment[] = [
  {
    id: 'a',
    userId: 'u1',
    postId: 'p1',
    platform: 'youtube',
    text: 'A',
    createdAt: '2026-01-01',
  },
  {
    id: 'b',
    userId: 'u2',
    postId: 'p2',
    platform: 'instagram',
    text: 'B',
    createdAt: '2026-01-02',
  },
];
describe('grounded comments', () => {
  it('enforces ownership', () =>
    expect(filterComments(rows, { userId: 'u1' }).map((x) => x.id)).toEqual([
      'a',
    ]));
  it('rejects citations outside filters', () =>
    expect(() => validateCommentCitations([rows[0]!], ['b'])).toThrow(
      /outside/
    ));
});
