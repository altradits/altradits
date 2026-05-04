-- name: ListTransactionsKeyset :many
-- Fetches the next set of transactions after the provided cursor
SELECT * FROM transactions
WHERE (created_at, id) < (@last_created_at, @last_id)
  AND deleted_at IS NULL
ORDER BY created_at DESC, id DESC
LIMIT @page_limit;