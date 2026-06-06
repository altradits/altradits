-- 000011_seed_user_data.up.sql
-- Transfer existing IS NULL system data to the first registered user
-- This runs after a user registers for the first time

-- Only run if there's exactly one user and system data exists
DO $$
DECLARE
    user_count INT;
    first_user_id UUID;
BEGIN
    SELECT COUNT(*), MIN(id) INTO user_count, first_user_id FROM users;
    
    IF user_count = 1 THEN
        -- Transfer budgets
        UPDATE budgets SET user_id = first_user_id WHERE user_id IS NULL;
        
        -- Transfer goals
        UPDATE goals SET user_id = first_user_id WHERE user_id IS NULL;
        
        -- Transfer daily_snapshots
        UPDATE daily_snapshots SET user_id = first_user_id WHERE user_id IS NULL;
        
        -- Transfer investments
        UPDATE investments SET user_id = first_user_id WHERE user_id IS NULL;
        
        -- Transfer freedom_targets
        UPDATE freedom_targets SET user_id = first_user_id WHERE user_id IS NULL;
        
        -- Transfer companion_state
        UPDATE companion_state SET user_id = first_user_id WHERE user_id IS NULL;
        
        -- Transfer companion_events
        UPDATE companion_events SET user_id = first_user_id WHERE user_id IS NULL;
        
        -- Transfer sms_inbox
        UPDATE sms_inbox SET user_id = first_user_id WHERE user_id IS NULL;
        
        -- Transfer transactions (if any system transactions exist)
        UPDATE transactions SET user_id = first_user_id WHERE user_id IS NULL;
        
        RAISE NOTICE 'System data transferred to user %', first_user_id;
    END IF;
END $$;

INSERT INTO _schema_versions (version) VALUES (11)
ON CONFLICT DO NOTHING;
