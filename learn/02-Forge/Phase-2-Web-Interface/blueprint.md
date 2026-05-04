# Phase 2 Data Flow

[User Click (HTMX)] 
        ↓ 
[Go Middleware (Log/Time)] 
        ↓ 
[Go Router (Chi)] 
        ↓ 
[Phase 1 Core Logic (Engine)] 
        ↓ 
[Go HTML Template (Partial)] 
        ↓ 
[HTMX Swaps Content (DOM)]