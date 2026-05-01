-- name: GetVaultDetails :one
-- Fetches a vault and the owner's username in one trip
SELECT 
    v.id, v.label, v.balance, u.username as owner_name
FROM vaults v
JOIN users u ON v.user_id = u.id
WHERE v.id = $1 LIMIT 1;

-- name: ListTransactionsWithNames :many
-- Joins transactions with sender and receiver vault labels
SELECT 
    t.id, t.amount, t.status,
    sv.label as sender_vault,
    rv.label as receiver_vault
FROM transactions t
LEFT JOIN vaults sv ON t.sender_vault_id = sv.id
LEFT JOIN vaults rv ON t.receiver_vault_id = rv.id
ORDER BY t.created_at DESC;