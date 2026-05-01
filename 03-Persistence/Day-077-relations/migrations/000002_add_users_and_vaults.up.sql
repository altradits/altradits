CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE vaults (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    label VARCHAR(100) NOT NULL,
    currency CHAR(3) DEFAULT 'USD',
    balance DECIMAL(15, 2) DEFAULT 0.00
);

-- Alter Transactions to link to Vaults instead of just names
ALTER TABLE transactions 
ADD COLUMN sender_vault_id UUID REFERENCES vaults(id),
ADD COLUMN receiver_vault_id UUID REFERENCES vaults(id);