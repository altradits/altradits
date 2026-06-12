-- 000023_hackathons.down.sql

DROP TABLE IF EXISTS hackathon_team_members;
DROP TABLE IF EXISTS hackathon_teams;
DROP TABLE IF EXISTS hackathon_applications;
DROP TABLE IF EXISTS hackathons;

DROP TYPE IF EXISTS hackathon_team_role;
DROP TYPE IF EXISTS hackathon_application_status;
DROP TYPE IF EXISTS hackathon_status;

DELETE FROM _schema_versions WHERE version = 23;
