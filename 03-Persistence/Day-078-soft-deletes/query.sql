-- name: ListActiveTransactions :many
-- Only returns transactions that haven't been "deleted"
SELECT * FROM transactions
WHERE deleted_at IS NULL
ORDER BY created_at DESC;

-- name: SoftDeleteTransaction :exec
-- Hides the transaction from the UI without erasing data
UPDATE transactions
SET deleted_at = CURRENT_TIMESTAMP
WHERE id = $1;

-- name: RestoreTransaction :exec
-- The "Undo" button—impossible with Hard Deletes
UPDATE transactions
SET deleted_at = NULL
WHERE id = $1;