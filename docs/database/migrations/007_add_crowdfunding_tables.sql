-- Crowdfunding / Well-wishers

-- Campaigns
CREATE TABLE campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id UUID REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    goal_sats BIGINT NOT NULL,
    raised_sats BIGINT DEFAULT 0,
    category TEXT CHECK (category IN ('event', 'student_sponsorship', 'hackathon', 'community_project')),
    related_event_id UUID REFERENCES events(id) ON DELETE SET NULL,
    related_student_id UUID REFERENCES users(id) ON DELETE SET NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Donations
CREATE TABLE donations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
    donor_id UUID REFERENCES users(id) ON DELETE CASCADE,
    amount_sats BIGINT NOT NULL,
    is_anonymous BOOLEAN DEFAULT FALSE,
    message TEXT,
    transaction_id UUID REFERENCES transactions(id),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Impact reports (updates to donors)
CREATE TABLE impact_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    evidence_url TEXT, -- photos, docs
    created_at TIMESTAMP DEFAULT NOW()
);
