// Prints a backup as db.json. Usage (on the server, as the site's user):
//   BACKUP_KEY=... node deploy/restore-backup.mjs ~/altradits-backups/db-2026-10-25.json.gz.enc > /tmp/db.json
// Check it, stop the app, copy it over ~/altradits-data/db.json, start the app.
import { readBackup } from "../lib/backup.js";
const file = process.argv[2];
if (!file) { console.error("Usage: node deploy/restore-backup.mjs <backup file>"); process.exit(1); }
const db = readBackup(file);
console.error(`OK: ${Object.keys(db.kv || {}).length} records, ${Object.keys(db.lists || {}).length} lists.`);
process.stdout.write(JSON.stringify(db));
