export type StoredComment = {
  id: string;
  userId: string;
  postId: string;
  platform: 'youtube' | 'instagram';
  text: string;
  createdAt: string;
};
export type CommentFilter = {
  userId: string;
  platforms?: Array<'youtube' | 'instagram'>;
  postIds?: string[];
  from?: string;
  to?: string;
};
export function filterComments(
  comments: StoredComment[],
  filter: CommentFilter
) {
  return comments.filter(
    (comment) =>
      comment.userId === filter.userId &&
      (!filter.platforms || filter.platforms.includes(comment.platform)) &&
      (!filter.postIds || filter.postIds.includes(comment.postId)) &&
      (!filter.from || comment.createdAt >= filter.from) &&
      (!filter.to || comment.createdAt <= filter.to)
  );
}
export function validateCommentCitations(
  selected: StoredComment[],
  citedIds: string[]
) {
  const allowed = new Set(selected.map((c) => c.id));
  const invalid = citedIds.filter((id) => !allowed.has(id));
  if (invalid.length)
    throw new Error(
      `Analysis cited comments outside the selected filter: ${invalid.join(', ')}`
    );
}
