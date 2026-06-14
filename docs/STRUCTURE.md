```
altradits/
│
├── README.md                          # Project overview, vision, quick start
├── Makefile                           # Build, test, and dev shortcuts
├── CONTRIBUTING.md                    # How to collaborate, code of conduct
├── SETUP.md                           # Local development setup guide
├── WHITEPAPER.md                      # Bitcoin philosophy & problem statement
├── VALUE_PROPOSITION.md               # Complete value prop for customers
├── ARCHITECTURE.md                    # System design, future scaling
├── ROADMAP.md                         # MVP → Phase 2 → Phase 3 timeline
├── ECOSYSTEM.md                       # Hackathon, Events, Travel, Education modules
│
├── docs/
│   ├── api/
│   │   ├── README.md                  # API overview
│   │   ├── customer.md                # Customer endpoints
│   │   ├── trader.md                  # Trader endpoints
│   │   ├── admin.md                   # Admin endpoints
│   │   ├── events.md                  # Event organizer endpoints
│   │   └── hackathon.md               # Hackathon student endpoints
│   ├── database/
│   │   ├── schema.sql                 # Complete PostgreSQL schema
│   │   ├── migrations/
│   │   │   ├── 001_init.sql
│   │   │   ├── 002_add_lock_tables.sql
│   │   │   ├── 003_add_profit_access.sql
│   │   │   ├── 004_add_events_tables.sql
│   │   │   ├── 005_add_hackathon_tables.sql
│   │   │   ├── 006_add_travel_tables.sql
│   │   │   └── 007_add_crowdfunding_tables.sql
│   │   └── erd.md                     # Entity relationship diagram
│   └── guides/
│       ├── contribution_guide.md
│       ├── security_audit.md
│       ├── event_organizer_guide.md
│       └── deployment_checklist.md
│
├── cmd/
│   └── server/
│       └── main.go                    # Entry point (Go standard library)
│
├── internal/
│   ├── handlers/
│   │   ├── auth.go                    # Register, login, session, logout
│   │   ├── customer.go                # Dashboard, deposit, withdraw, send, receive
│   │   ├── business.go                # Add business, inject profit, list businesses
│   │   ├── investment.go              # Add lock, list locks, early withdrawal
│   │   ├── trader.go                  # Assets, profit updates, portfolio view
│   │   ├── admin.go                   # Approvals, distribution, settings
│   │   ├── profit_access.go           # After-maturity daily/weekly/monthly/annual
│   │   ├── events.go                  # Event listing, creation, registration
│   │   ├── hackathon.go               # Student signup, QR check-in, game, submissions
│   │   ├── travel.go                  # Travel packages, bookings, Gorilla Sats integration
│   │   └── crowdfunding.go            # Well-wishers pool, sponsor sats
│   │
│   ├── db/
│   │   ├── connection.go              # PostgreSQL connection pool
│   │   ├── queries.go                 # Raw SQL query functions
│   │   ├── migrations.go              # Run migrations on startup
│   │   └── seed.go                    # Default data (admin, pool settings)
│   │
│   ├── models/
│   │   ├── user.go                    # User struct + methods
│   │   ├── wallet.go                  # Wallet struct + balance methods
│   │   ├── lock.go                    # Investment lock struct
│   │   ├── business.go                # Business struct
│   │   ├── transaction.go             # Transaction struct
│   │   ├── asset.go                   # Asset struct (VOO, BND, etc.)
│   │   ├── profit_log.go              # Manual profit entries
│   │   ├── pool_settings.go           # Admin fee, conversion rate
│   │   ├── event.go                   # Event struct (organizer, date, venue)
│   │   ├── hackathon.go               # Hackathon, student, submission, attendance
│   │   ├── travel.go                  # Travel package, booking
│   │   └── crowdfunding.go            # Campaign, donation, reward
│   │
│   ├── middleware/
│   │   ├── auth.go                    # Session validation
│   │   ├── admin_only.go              # Role-based access
│   │   ├── event_organizer_only.go    # Event-specific auth
│   │   └── logging.go                 # Request logging
│   │
│   ├── services/
│   │   ├── profit_engine.go           # Distribution math
│   │   ├── lock_scheduler.go          # Maturity checker
│   │   ├── profit_distributor.go      # Daily/weekly/monthly/annual payouts
│   │   ├── conversion.go              # KES ↔ sats conversion
│   │   ├── qr_service.go              # QR code generation for check-ins
│   │   ├── game_engine.go             # Pre-event quiz game
│   │   ├── certification.go           # Certificate generation
│   │   └── review_system.go           # Community review of submissions
│   │
│   └── utils/
│       ├── crypto.go                  # Basic helpers (no real crypto for MVP)
│       ├── validators.go              # Email, phone validation
│       ├── formatters.go              # Sats formatting, KES formatting
│       └── qr.go                      # QR code utilities
│
├── web/
│   ├── static/
│   │   ├── css/
│   │   │   ├── style.css              # Global styles
│   │   │   ├── dashboard.css          # Dashboard-specific
│   │   │   ├── events.css             # Events listing and detail
│   │   │   ├── hackathon.css          # Hackathon-specific
│   │   │   └── mobile.css             # Responsive (mobile-first)
│   │   ├── js/
│   │   │   ├── app.js                 # Main entry
│   │   │   ├── api.js                 # fetch() wrappers
│   │   │   ├── tangle.js              # Currency swap on tap
│   │   │   ├── dashboard.js           # Dashboard interactions
│   │   │   ├── investments.js         # Lock creation, listing
│   │   │   ├── businesses.js          # Business management
│   │   │   ├── events.js              # Event listing, registration
│   │   │   ├── hackathon.js           # Student dashboard, game, submissions
│   │   │   ├── qr-scanner.js          # QR check-in scanner
│   │   │   └── travel.js              # Travel bookings
│   │   └── assets/
│   │       ├── logo.svg
│   │       └── certificates/
│   │
│   └── templates/
│       ├── layout.html                # Base template with header/footer
│       ├── home.html                  # Landing page (non-logged-in)
│       ├── register.html              # Signup (email/phone only)
│       ├── login.html                 # Login page
│       │
│       ├── customer/
│       │   ├── dashboard.html         # Main customer view
│       │   ├── deposit.html           # Deposit request form
│       │   ├── withdraw.html          # Withdraw request form
│       │   ├── send.html              # Send sats (Lightning)
│       │   ├── receive.html           # Receive sats (invoice)
│       │   ├── transactions.html      # Transaction history
│       │   ├── businesses.html        # List + add businesses
│       │   ├── add_business.html      # Form to add business
│       │   ├── investments.html       # List all locks
│       │   ├── add_investment.html    # Lock new sats
│       │   ├── lock_detail.html       # Single lock view with countdown
│       │   ├── profit_access.html     # Choose access schedule after maturity
│       │   └── settings.html          # Profile settings
│       │
│       ├── events/
│       │   ├── list.html              # All Bitcoin events
│       │   ├── detail.html            # Single event view
│       │   ├── register.html          # Register for event (pay sats)
│       │   ├── organizer/
│       │   │   ├── dashboard.html     # Organizer dashboard
│       │   │   ├── create.html        # Create new event
│       │   │   ├── manage.html        # Manage event (materials, check-ins)
│       │   │   ├── qr_checkin.html    # QR scanner for daily check-in
│       │   │   ├── students.html      # View registered students
│       │   │   ├── communications.html# Send materials, links, chat
│       │   │   └── rewards.html       # Reward students with sats
│       │   └── game.html              # Pre-event quiz game
│       │
│       ├── hackathon/
│       │   ├── student_dashboard.html # Student view
│       │   ├── project_submit.html    # Submit project/homework
│       │   ├── submissions_list.html  # Browse submissions (community review)
│       │   ├── submission_detail.html # View + review + award points
│       │   ├── certification.html     # Certificate after graduation
│       │   └── leaderboard.html       # Points ranking
│       │
│       ├── travel/
│       │   ├── packages.html          # Travel packages (Gorilla Sats)
│       │   ├── booking.html           # Book with sats
│       │   ├── my_trips.html          # Customer's booked trips
│       │   └── safari_details.html    # Safari itinerary
│       │
│       ├── crowdfunding/
│       │   ├── campaigns.html         # Active campaigns
│       │   ├── campaign_detail.html   # Single campaign
│       │   ├── donate.html            # Donate sats
│       │   └── my_donations.html      # User's donation history
│       │
│       ├── trader/
│       │   ├── dashboard.html         # Trader overview
│       │   ├── assets.html            # List all assets
│       │   ├── add_asset.html         # Add new asset (VOO, BND)
│       │   ├── profit_update.html     # Manual profit entry form
│       │   ├── portfolio.html         # Diversification view
│       │   └── settings.html
│       │
│       └── admin/
│           ├── dashboard.html         # Executive summary
│           ├── deposits.html          # Pending deposit approvals
│           ├── withdrawals.html       # Pending withdrawal approvals
│           ├── customers.html         # List all customers
│           ├── customer_detail.html   # Single customer view
│           ├── distribution.html      # Trigger profit distribution
│           ├── conversion_rate.html   # Edit KES/sats rate
│           ├── events_approval.html   # Approve events created by organizers
│           ├── hackathon_review.html  # Review hackathon submissions
│           └── settings.html
│
├── scripts/
│   ├── run_dev.sh                     # Start dev server
│   ├── run_tests.sh                   # Run all tests
│   ├── backup_db.sh                   # Backup PostgreSQL
│   └── seed_test_data.sh              # Populate test customers
│
├── tests/
│   ├── integration/
│   │   ├── auth_test.go
│   │   ├── investment_test.go
│   │   ├── distribution_test.go
│   │   ├── events_test.go
│   │   └── hackathon_test.go
│   ├── unit/
│   │   ├── profit_engine_test.go
│   │   ├── lock_scheduler_test.go
│   │   └── game_engine_test.go
│   └── e2e/
│       └── customer_flow_test.go
│
├── go.mod
├── go.sum
├── .env.example                       # Environment variables template
├── .gitignore
├── .air.toml                          # Hot reload for development
└── Dockerfile                         # For future deployment
```
