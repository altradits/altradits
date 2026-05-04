ALTER TABLE transactions ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE vaults ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE;

-- Performance: Index the null check
CREATE INDEX idx_transactions_active ON transactions (id) WHERE deleted_at IS NULL;