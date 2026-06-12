-- 000024_hackathon_engagement.down.sql

DROP TABLE IF EXISTS hackathon_rewards;
DROP TABLE IF EXISTS hackathon_social_posts;
ALTER TABLE hackathons DROP COLUMN IF EXISTS social_post_reward_sats;
DROP TABLE IF EXISTS hackathon_homework_submissions;
DROP TABLE IF EXISTS hackathon_homework;
DROP TYPE IF EXISTS hackathon_submission_status;
DROP TABLE IF EXISTS hackathon_chat_messages;
DROP TABLE IF EXISTS hackathon_checkins;
DROP TABLE IF EXISTS hackathon_checkin_codes;
DROP TABLE IF EXISTS hackathon_daily_notes;

DELETE FROM _schema_versions WHERE version = 24;
