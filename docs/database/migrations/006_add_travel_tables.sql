-- Travel & Leisure (Gorilla Sats partnership)

-- Travel packages
CREATE TABLE travel_packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    destination TEXT,
    duration_days INT,
    price_sats BIGINT NOT NULL,
    includes JSONB, -- e.g., ["flights", "hotel", "safari"]
    images JSONB,
    partner_name TEXT DEFAULT 'Gorilla Sats',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Bookings
CREATE TABLE travel_bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    package_id UUID REFERENCES travel_packages(id) ON DELETE CASCADE,
    booking_date DATE NOT NULL,
    travel_date DATE NOT NULL,
    number_of_people INT DEFAULT 1,
    total_price_sats BIGINT NOT NULL,
    status TEXT DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled', 'completed')),
    special_requests TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Itinerary items
CREATE TABLE itinerary_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID REFERENCES travel_bookings(id) ON DELETE CASCADE,
    day_number INT,
    activity TEXT,
    time TIME,
    location TEXT,
    notes TEXT
);
