-- Add a weighted Postgres full-text index for story search.
CREATE INDEX "Story_full_text_search_idx" ON "Story" USING GIN (
  (
    setweight(to_tsvector('english', coalesce("title", '')), 'A') ||
    setweight(to_tsvector('english', coalesce("excerpt", '')), 'B') ||
    setweight(to_tsvector('english', coalesce("topic", '')), 'B') ||
    setweight(to_tsvector('english', coalesce("authorName", '')), 'C') ||
    setweight(to_tsvector('english', coalesce("authorBio", '')), 'D') ||
    setweight(to_tsvector('english', coalesce("searchText", '')), 'D')
  )
);
