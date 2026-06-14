// Event listing, creation, registration

// TODO: implement this (see docs/STRUCTURE.md and ECOSYSTEM.md).
//
// Planned handlers for the events module:
//   - OrganizerDashboard   GET  /events/organizer/dashboard
//       Lists events for the logged-in organizer (requires
//       internal/middleware/event_organizer_only.go).
//   - CreateEventAPI       POST /events/organizer/create
//       Inserts a new row into events (see migration 004_add_events_tables.sql),
//       starts as status = 'draft' until admin approval (is_approved).
//   - QRCheckinAPI         POST /events/organizer/checkin
//       Records a row in attendance_logs for today, increments
//       event_registrations.attendance_days, and rewards the student's
//       wallet (liquid_sats) -- see internal/services/qr_service.go.
//   - SendMaterialsAPI     POST /events/organizer/communications
//       Updates events.materials_url and inserts an event_messages row
//       (message_type = 'material').
//
// To build these for real you'll need, in order:
//   1. internal/models/event.go      -- define Event, EventRegistration, AttendanceLog.
//   2. internal/models/user.go       -- define User.
//   3. internal/db/connection.go     -- export DB *sql.DB (or your chosen driver).
//   4. internal/db/queries.go        -- GetEventsByOrganizer, plus the inserts/updates
//                                        used above.
//   5. A shared session helper (e.g. internal/middleware/auth.go) for
//      getSessionUserOrRedirect, and a template helper for renderTemplate.
//   6. Only then add this package's `package handlers` line + imports
//      (encoding/json, net/http, time, github.com/google/uuid if you want UUID ids --
//      that would be Altradits' first external dependency, so add it deliberately
//      via `go get` and review what it pulls in).
//
// Wire the finished handlers into cmd/server/main.go's commented-out
// "Events" routes once they compile.
