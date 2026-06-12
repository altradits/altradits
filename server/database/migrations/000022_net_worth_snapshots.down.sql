-- 000022_net_worth_snapshots.down.sql

DROP TABLE IF EXISTS net_worth_snapshots;

DELETE FROM _schema_versions WHERE version = 22;
