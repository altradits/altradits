// Student signup, QR check-in, game, submissions

// TODO: implement this (see docs/STRUCTURE.md and ECOSYSTEM.md).
//
// Planned handlers for the hackathon module:
//   - StudentDashboard      GET  /hackathon/dashboard
//       Shows the student's event registrations, submissions, and total points.
//   - SubmitProjectAPI      POST /hackathon/submit
//       Accepts a project/homework submission for review.
//   - GetGameQuestionsAPI   GET  /hackathon/game/questions
//       Returns the pre-event quiz questions (see game_questions table, migration 005).
//   - SubmitGameAnswerAPI   POST /hackathon/game/answer
//       Records a student's answer and awards points.
//   - ReviewSubmissionAPI   POST /hackathon/submissions/{id}/review
//       Lets any logged-in user rate/review a submission (decentralized review,
//       see WHITEPAPER.md Value 5).
//   - IssueCertificateAPI   POST /hackathon/certificates/issue
//       Generates a certificate after graduation (see internal/services/certification.go).
//
// To build these for real you'll need, in order:
//   1. internal/models/hackathon.go  -- define HackathonSubmission, Certificate, etc.
//   2. internal/models/user.go       -- define User, EventRegistration
//   3. internal/db/connection.go     -- export DB *sql.DB (or your chosen driver)
//   4. internal/db/queries.go        -- GetStudentEventRegistrations, GetStudentSubmissions,
//                                        GetStudentTotalPoints, etc.
//   5. A shared session helper (e.g. internal/middleware/auth.go) for
//      getSessionUserOrRedirect, and a template helper for renderTemplate.
//   6. Only then add this package's `package handlers` line + imports
//      (encoding/json, net/http, github.com/google/uuid if you want UUID ids --
//      that would be Altradits' first external dependency, so add it deliberately
//      via `go get` and review what it pulls in).
//
// Wire the finished handlers into cmd/server/main.go's commented-out
// "Hackathon" routes once they compile.
