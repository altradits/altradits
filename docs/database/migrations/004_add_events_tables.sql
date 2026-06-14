-- Events tables

-- Events table
CREATE TABLE events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organizer_id UUID REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    venue TEXT,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    daily_start_time TIME,
    daily_end_time TIME,
    capacity INT,
    ticket_price_sats BIGINT DEFAULT 0,
    materials_url TEXT, -- PPTs, notes, links
    is_approved BOOLEAN DEFAULT FALSE,
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'ongoing', 'completed', 'cancelled')),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Event registrations (students)
CREATE TABLE event_registrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID REFERENCES events(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    ticket_paid_sats BIGINT NOT NULL,
    attendance_days INT DEFAULT 0,
    qr_code_secret TEXT, -- for daily check-in
    status TEXT DEFAULT 'registered' CHECK (status IN ('registered', 'attended', 'completed', 'cancelled')),
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(event_id, user_id)
);

-- Daily attendance (QR check-in)
CREATE TABLE attendance_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    registration_id UUID REFERENCES event_registrations(id) ON DELETE CASCADE,
    check_in_date DATE NOT NULL,
    scanned_by UUID REFERENCES users(id), -- organizer who scanned
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(registration_id, check_in_date)
);

-- Pre-event game questions
CREATE TABLE game_questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID REFERENCES events(id) ON DELETE CASCADE,
    question_text TEXT NOT NULL,
    options JSONB, -- array of options
    correct_answer TEXT,
    points INT DEFAULT 10,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Game answers (students)
CREATE TABLE game_answers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id UUID REFERENCES game_questions(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    answer TEXT,
    is_correct BOOLEAN,
    points_earned INT,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(question_id, user_id)
);

-- Communications (organizer to students)
CREATE TABLE event_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID REFERENCES events(id) ON DELETE CASCADE,
    sender_id UUID REFERENCES users(id),
    message TEXT,
    message_type TEXT CHECK (message_type IN ('announcement', 'material', 'reminder', 'chat')),
    sent_to_all BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);
