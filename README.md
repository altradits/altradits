<div align="center">

# ⚡ ALTRADITS ⚡
### *The Socratic Path to Go Mastery*

<a href="https://e2b.dev/startups">
  <img src="Black-2.png" alt="SPONSORED BY E2B FOR STARTUPS" width="100%">
</a>

<br>

[![Go Version](https://img.shields.io/badge/Go-1.2x+-00ADD8?style=for-the-badge&logo=go&logoColor=white)](https://go.dev/)
[![Method](https://img.shields.io/badge/Method-Socratic-green?style=for-the-badge)](#-the-socratic-mentor)
[![Learning Environment](https://img.shields.io/badge/Sandbox-E2B-ff8800?style=for-the-badge)](https://e2b.dev)
[![Ecosystem](https://img.shields.io/badge/Built_at-Zone01_Kisumu-blue?style=for-the-badge)](https://www.zone01kisumu.ke/)

**Empowering the next generation (11+) to build the future of systems engineering.** *No shortcuts. No copy-paste. Just pure mastery of the Go language.*

---
</div>

## 🎯 The Vision
Altradits is a specialized engineering forge. We don't just teach syntax; we cultivate the **engineering mindset**. Our mission is to turn young learners into expert **Go** developers by focusing on high-level logic, secure infrastructure, and agentic discovery.

## 🧠 The Socratic Charter
To ensure true mastery, our AI Mentor operates under three non-negotiable laws:
1. **Never Give Code:** The AI identifies the *concept* causing an error, never the *fix*.
2. **Validate via Sandbox:** Feedback is based on real-time E2B terminal output, not just code intent.
3. **Encourage Failure:** We treat a "panic" or "nil pointer" as a milestone, not a mistake.

## 🛡️ Powered by E2B
We leverage **E2B's agent-native sandboxes** to provide a production-grade playground.
* **Safe Playground:** Students execute low-level Go code in secure, isolated cloud environments.
* **Real-time Analysis:** Our Socratic AI agents monitor sandbox output to provide context-aware guidance **without** providing the solution.
* **The Feedback Loop:** Student Logic → E2B Sandbox Execution → AI Observation (stdout/stderr) → Socratic Inquiry.

## 🗺️ Project Roadmap
- [ ] **Phase 1:** Core Go/E2B Integration (The "Hello World" Sandbox).
- [ ] **Phase 2:** Socratic Feedback Engine (Context-aware logic via Claude 3.5).
- [ ] **Phase 3:** Automated Peer-Review (GitHub Actions CI/CD).
- [ ] **Phase 4:** The "Financial Go" Extension (Building real-world money tools).

## 🛠️ Tech Stack & Architecture

| Layer | Technology | Role |
| :--- | :--- | :--- |
| **Core Engine** | **Go (Golang)** | High-concurrency systems logic & Backend API |
| **Sandbox Infra** | **[E2B](https://e2b.dev)** | Secure, agent-native micro-VMs for code execution |
| **The Brain** | **Claude 3.5 Sonnet** | Socratic Mentor (Optimized for code reasoning) |
| **Orchestration** | **Go Fiber** | High-performance, lean web framework |
| **Frontend** | **HTMX + Tailwind** | Server-driven interactivity & modern aesthetic |
| **Data & Auth** | **Supabase** | PostgreSQL persistence & secure student sessions & JWT|
| **Streaming** | **WebSockets** | Real-time terminal output from Sandbox to UI |

---

### 🏗️ Technical Architecture Details

#### ⚙️ Backend & Orchestration
* **Go Fiber:** Chosen for its low overhead and high performance, serving as the primary API layer.
* **WebSockets:** Integrated to handle the bi-directional stream of data between the E2B terminal and the frontend, ensuring zero-latency feedback for students.

#### 🧠 Socratic Intelligence
* **Agentic Logic:** Leveraging **Claude 3.5 Sonnet** via the Anthropic API to analyze sandbox `stdout` and `stderr`.
* **The Socratic Wrapper:** Proprietary system prompting that intercepts direct answers and converts them into pedagogical inquiries.

#### 🛡️ Infrastructure & Security
* **E2B Sandboxes:** Every execution runs in a fresh, isolated Linux micro-VM. Untrusted student code never touches the host system.
* **Supabase (PostgreSQL):** Manages the "Mastery Points" ledger and saves student progress across sessions.
* **GitHub Actions:** Powering the "Automated Auditor" for CI/CD project submissions.
* **Docker:** Ensures environment parity between development at Zone01 and production deployment.

### 📂 Project Structure
```text
altradits
├── cmd/
│   └── server/
│       └── main.go       # Boots the app
├── internal/
│   ├── mentor/           # The "Socratic Brain" (Private)
│   └── auth/             # Session management (Private)
├── pkg/
│   ├── sandbox/          # E2B Wrapper (Could be used by other tools)
│   ├── database/         # Supabase/Postgres connection logic
│   └── ui/               # Custom HTMX components/renderers
├── web/
│   ├── templates/        # HTML (HTMX)
│   └── static/           # CSS/JS
├── go.mod
└── README.md
```
---

## 👨‍💻 Founder & Lead Architect
**Stanley Chege Thuita** *Software Engineering Apprentice @ [Zone01 Kisumu](https://www.linkedin.com/company/zone01kisumu/)*

Immersed in the **Software Developer Apprentice Cohort 2** at Zone01, I am building Altradits to scale the rigorous, logic-first learning model I experience daily. My mission is to provide students with high-level engineering challenges in a secure, AI-mentored environment.

**Connect with the journey:** [![LinkedIn](https://img.shields.io/badge/LinkedIn-Connect-blue?style=flat&logo=linkedin)](https://www.linkedin.com/in/stanmobitech) 
[![GitHub](https://img.shields.io/badge/GitHub-altradits-lightgrey?style=flat&logo=github)](https://github.com/altradits/altradits)