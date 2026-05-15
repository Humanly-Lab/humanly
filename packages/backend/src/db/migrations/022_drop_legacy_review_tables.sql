-- Retire the legacy paper/review schema after PDF storage moved to files.
-- The application no longer uses these tables, and legacy foreign keys can block
-- task deletion because some of them were created before projects became tasks.

DROP TABLE IF EXISTS review_ai_messages CASCADE;
DROP TABLE IF EXISTS review_ai_interaction_logs CASCADE;
DROP TABLE IF EXISTS review_recordings CASCADE;
DROP TABLE IF EXISTS review_events CASCADE;
DROP TABLE IF EXISTS review_comments CASCADE;
DROP TABLE IF EXISTS review_ai_sessions CASCADE;
DROP TABLE IF EXISTS reviews CASCADE;
DROP TABLE IF EXISTS paper_reviewers CASCADE;
DROP TABLE IF EXISTS paper_access_logs CASCADE;
DROP TABLE IF EXISTS paper_text_chunks CASCADE;
DROP TABLE IF EXISTS paper_sections CASCADE;
DROP TABLE IF EXISTS paper_pages CASCADE;
DROP TABLE IF EXISTS papers CASCADE;

DROP FUNCTION IF EXISTS set_recording_expiry() CASCADE;
DROP FUNCTION IF EXISTS update_papers_updated_at() CASCADE;
