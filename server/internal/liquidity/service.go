package liquidity

import (
	"context"
	"errors"
	"fmt"
	"math/rand"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/altradits/altradits/server/internal/wallet"
)

// Service manages the Lightning node's liquidity: its channel topology, peer
// connections, on-chain reserve, routing fee revenue, and M-Pesa settlement
// queues/float.
type Service struct {
	db *pgxpool.Pool
}

// NewService creates the liquidity service.
func NewService(db *pgxpool.Pool) *Service {
	return &Service{db: db}
}

// querier is satisfied by both *pgxpool.Pool and pgx.Tx, letting shared
// helpers run either standalone or inside a transaction.
type querier interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
}

// logAction records a channel/swap/float management action in
// liquidity_action_log. userID is nil for actions performed by the
// automation worker.
func (s *Service) logAction(ctx context.Context, q querier, userID *string, actionType string, channelID *string, detail string) error {
	_, err := q.Exec(ctx, `
		INSERT INTO liquidity_action_log (action_type, channel_id, detail, performed_by)
		VALUES ($1, $2, $3, $4)
	`, actionType, channelID, detail, userID)
	return err
}

// channelHealth derives a channel's heatmap/alert classification from its
// status and local/remote balance split.
func channelHealth(c Channel) string {
	if c.Status != "active" {
		return "zombie"
	}
	if c.LocalRatioPct < 20 || c.LocalRatioPct > 80 {
		return "needs_rebalance"
	}
	return "balanced"
}

// GetNodeStatus returns the node's identity, sync state, and a snapshot of
// its peer/channel counts and uptime.
func (s *Service) GetNodeStatus(ctx context.Context) (*NodeStatus, error) {
	var status NodeStatus
	var startedAt time.Time
	if err := s.db.QueryRow(ctx, `
		SELECT alias, pubkey, block_height, synced_to_chain, version, started_at
		FROM ln_node_status WHERE id = 1
	`).Scan(&status.Alias, &status.Pubkey, &status.BlockHeight, &status.SyncedToChain, &status.Version, &startedAt); err != nil {
		return nil, err
	}
	status.UptimeSeconds = int64(time.Since(startedAt).Seconds())

	if err := s.db.QueryRow(ctx, `SELECT COUNT(*) FROM ln_peers WHERE connected`).Scan(&status.NumPeers); err != nil {
		return nil, err
	}
	if err := s.db.QueryRow(ctx, `SELECT COUNT(*) FROM ln_channels WHERE status = 'active'`).Scan(&status.NumActiveChannels); err != nil {
		return nil, err
	}

	return &status, nil
}

// GetChannels returns every channel with derived ratio/health, plus
// aggregate totals across active channels.
func (s *Service) GetChannels(ctx context.Context) (*ChannelsResponse, error) {
	rows, err := s.db.Query(ctx, `
		SELECT channel_id, peer_alias, peer_pubkey, capacity_sats, local_balance_sats, remote_balance_sats, fee_rate_ppm, base_fee_msat, status
		FROM ln_channels
		ORDER BY peer_alias
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	resp := &ChannelsResponse{Channels: []Channel{}}
	for rows.Next() {
		var c Channel
		if err := rows.Scan(&c.ChannelID, &c.PeerAlias, &c.PeerPubkey, &c.CapacitySats, &c.LocalBalanceSats, &c.RemoteBalanceSats, &c.FeeRatePPM, &c.BaseFeeMsat, &c.Status); err != nil {
			return nil, err
		}
		if c.CapacitySats > 0 {
			c.LocalRatioPct = float64(c.LocalBalanceSats) / float64(c.CapacitySats) * 100
		}
		c.Health = channelHealth(c)

		if c.Status == "active" {
			resp.TotalLocalSats += c.LocalBalanceSats
			resp.TotalRemoteSats += c.RemoteBalanceSats
			resp.TotalCapacitySats += c.CapacitySats
		}
		resp.Channels = append(resp.Channels, c)
	}
	return resp, rows.Err()
}

// GetPeers returns all known Lightning network peers.
func (s *Service) GetPeers(ctx context.Context) ([]Peer, error) {
	rows, err := s.db.Query(ctx, `
		SELECT pubkey, alias, address, connected FROM ln_peers ORDER BY alias
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	peers := []Peer{}
	for rows.Next() {
		var p Peer
		if err := rows.Scan(&p.Pubkey, &p.Alias, &p.Address, &p.Connected); err != nil {
			return nil, err
		}
		peers = append(peers, p)
	}
	return peers, rows.Err()
}

// GetOnchain returns the node's on-chain BTC reserve balance and recent
// transaction history.
func (s *Service) GetOnchain(ctx context.Context) (*OnchainInfo, error) {
	var info OnchainInfo
	if err := s.db.QueryRow(ctx, `
		SELECT onchain_confirmed_sats, onchain_unconfirmed_sats FROM ln_node_status WHERE id = 1
	`).Scan(&info.ConfirmedSats, &info.UnconfirmedSats); err != nil {
		return nil, err
	}

	rows, err := s.db.Query(ctx, `
		SELECT direction, amount_sats, txid, confirmations, created_at
		FROM ln_onchain_txs
		ORDER BY created_at DESC
		LIMIT 10
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	info.Transactions = []OnchainTx{}
	for rows.Next() {
		var t OnchainTx
		var createdAt time.Time
		if err := rows.Scan(&t.Direction, &t.AmountSats, &t.Txid, &t.Confirmations, &createdAt); err != nil {
			return nil, err
		}
		t.CreatedAt = createdAt.Format(time.RFC3339)
		info.Transactions = append(info.Transactions, t)
	}
	return &info, rows.Err()
}

// GetRoutingFeeHistory returns up to `days` days of routing fee revenue,
// oldest first.
func (s *Service) GetRoutingFeeHistory(ctx context.Context, days int) ([]RoutingFeePoint, error) {
	if days <= 0 {
		days = 30
	}
	if days > 90 {
		days = 90
	}

	rows, err := s.db.Query(ctx, `
		SELECT snapshot_date::text, fee_sats
		FROM ln_routing_fee_history
		ORDER BY snapshot_date DESC
		LIMIT $1
	`, days)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	points := []RoutingFeePoint{}
	for rows.Next() {
		var p RoutingFeePoint
		if err := rows.Scan(&p.Date, &p.FeeSats); err != nil {
			return nil, err
		}
		points = append(points, p)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	for i, j := 0, len(points)-1; i < j; i, j = i+1, j-1 {
		points[i], points[j] = points[j], points[i]
	}
	return points, nil
}

// mpesaQueue returns the pending wallet_transactions of the given type,
// joined with the requesting user's name.
func (s *Service) mpesaQueue(ctx context.Context, txType string) ([]MpesaQueueEntry, error) {
	rows, err := s.db.Query(ctx, `
		SELECT t.id, u.name, t.amount_sats, COALESCE(t.amount_kes, 0), t.created_at
		FROM wallet_transactions t
		JOIN users u ON u.id = t.user_id
		WHERE t.status = 'pending' AND t.type::text = $1
		ORDER BY t.created_at
	`, txType)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	entries := []MpesaQueueEntry{}
	for rows.Next() {
		var e MpesaQueueEntry
		var createdAt time.Time
		if err := rows.Scan(&e.ID, &e.UserName, &e.AmountSats, &e.AmountKES, &createdAt); err != nil {
			return nil, err
		}
		e.CreatedAt = createdAt.Format(time.RFC3339)
		entries = append(entries, e)
	}
	return entries, rows.Err()
}

// GetMpesaQueues returns the pending M-Pesa deposit (Mpesa -> sats) and
// withdrawal (sats -> Mpesa) queues.
func (s *Service) GetMpesaQueues(ctx context.Context) (*MpesaQueues, error) {
	deposits, err := s.mpesaQueue(ctx, wallet.TypeDepositMpesa)
	if err != nil {
		return nil, err
	}
	withdrawals, err := s.mpesaQueue(ctx, wallet.TypeWithdrawMpesa)
	if err != nil {
		return nil, err
	}
	return &MpesaQueues{Deposits: deposits, Withdrawals: withdrawals}, nil
}

// GetOverview returns the node operator's top-level snapshot: Lightning +
// on-chain liquidity, pending M-Pesa settlement, and routing fee revenue.
func (s *Service) GetOverview(ctx context.Context) (*Overview, error) {
	channels, err := s.GetChannels(ctx)
	if err != nil {
		return nil, err
	}

	var overview Overview
	overview.TotalLocalSats = channels.TotalLocalSats
	overview.TotalRemoteSats = channels.TotalRemoteSats
	overview.TotalCapacitySats = channels.TotalCapacitySats

	if err := s.db.QueryRow(ctx, `
		SELECT onchain_confirmed_sats, onchain_unconfirmed_sats FROM ln_node_status WHERE id = 1
	`).Scan(&overview.OnchainConfirmedSats, &overview.OnchainUnconfirmedSats); err != nil {
		return nil, err
	}

	queues, err := s.GetMpesaQueues(ctx)
	if err != nil {
		return nil, err
	}
	for _, e := range queues.Deposits {
		overview.PendingMpesaDepositSats += e.AmountSats
	}
	for _, e := range queues.Withdrawals {
		overview.PendingMpesaWithdrawSats += e.AmountSats
	}

	if err := s.db.QueryRow(ctx, `
		SELECT COALESCE((SELECT fee_sats FROM ln_routing_fee_history WHERE snapshot_date = CURRENT_DATE), 0)
	`).Scan(&overview.RoutingFeesTodaySats); err != nil {
		return nil, err
	}

	if err := s.db.QueryRow(ctx, `
		SELECT COALESCE(SUM(fee_sats), 0) FROM ln_routing_fee_history WHERE snapshot_date > CURRENT_DATE - INTERVAL '30 days'
	`).Scan(&overview.RoutingFees30dSats); err != nil {
		return nil, err
	}

	return &overview, nil
}

// GetAlerts evaluates channels, peers, and liquidity config against a few
// simple rules and returns any that fire.
func (s *Service) GetAlerts(ctx context.Context) ([]Alert, error) {
	channels, err := s.GetChannels(ctx)
	if err != nil {
		return nil, err
	}
	peers, err := s.GetPeers(ctx)
	if err != nil {
		return nil, err
	}
	overview, err := s.GetOverview(ctx)
	if err != nil {
		return nil, err
	}
	config, err := s.GetConfig(ctx)
	if err != nil {
		return nil, err
	}

	alerts := []Alert{}
	zombiePubkeys := make(map[string]bool)

	for _, c := range channels.Channels {
		switch c.Health {
		case "needs_rebalance":
			alerts = append(alerts, Alert{
				Severity: "warning",
				Title:    "Channel needs rebalancing",
				Detail:   fmt.Sprintf("%s is %.0f%% local", c.PeerAlias, c.LocalRatioPct),
			})
		case "zombie":
			zombiePubkeys[c.PeerPubkey] = true
			alerts = append(alerts, Alert{
				Severity: "critical",
				Title:    "Zombie channel",
				Detail:   fmt.Sprintf("%s is inactive", c.PeerAlias),
			})
		}
	}

	if overview.TotalLocalSats < config.HotWalletMinSats {
		alerts = append(alerts, Alert{
			Severity: "critical",
			Title:    "Low hot-wallet liquidity",
			Detail:   fmt.Sprintf("%d sats available (min %d sats)", overview.TotalLocalSats, config.HotWalletMinSats),
		})
	}

	if config.MpesaFloatBalanceKES < config.MpesaFloatLowThresholdKES {
		alerts = append(alerts, Alert{
			Severity: "warning",
			Title:    "M-Pesa float low",
			Detail:   fmt.Sprintf("%.2f KES (threshold %.2f KES)", config.MpesaFloatBalanceKES, config.MpesaFloatLowThresholdKES),
		})
	}

	if config.MpesaFloatBalanceKES > config.MpesaFloatHighThresholdKES {
		alerts = append(alerts, Alert{
			Severity: "info",
			Title:    "M-Pesa float high",
			Detail:   fmt.Sprintf("%.2f KES (consider sweeping)", config.MpesaFloatBalanceKES),
		})
	}

	if overview.PendingMpesaWithdrawSats > overview.TotalLocalSats {
		alerts = append(alerts, Alert{
			Severity: "critical",
			Title:    "Liquidity shortfall",
			Detail:   "Pending M-Pesa withdrawals exceed available channel liquidity",
		})
	}

	for _, p := range peers {
		if !p.Connected && !zombiePubkeys[p.Pubkey] {
			alerts = append(alerts, Alert{
				Severity: "info",
				Title:    "Peer disconnected",
				Detail:   fmt.Sprintf("%s is not connected", p.Alias),
			})
		}
	}

	return alerts, nil
}

// GetConfig returns the liquidity manager's current thresholds and M-Pesa
// float balance.
func (s *Service) GetConfig(ctx context.Context) (*Config, error) {
	var config Config
	if err := s.db.QueryRow(ctx, `
		SELECT hot_wallet_min_sats, auto_open_channel_threshold_sats, mpesa_float_balance_kes, mpesa_float_low_threshold_kes, mpesa_float_high_threshold_kes
		FROM liquidity_config WHERE id = 1
	`).Scan(&config.HotWalletMinSats, &config.AutoOpenChannelThresholdSats, &config.MpesaFloatBalanceKES, &config.MpesaFloatLowThresholdKES, &config.MpesaFloatHighThresholdKES); err != nil {
		return nil, err
	}
	return &config, nil
}

// UpdateConfig sets the liquidity manager's thresholds. The M-Pesa float
// balance itself is only changed via replenish/sweep/automation.
func (s *Service) UpdateConfig(ctx context.Context, config Config) (*Config, error) {
	if config.HotWalletMinSats < 0 || config.AutoOpenChannelThresholdSats < 0 {
		return nil, errors.New("hot_wallet_min_sats and auto_open_channel_threshold_sats must be non-negative")
	}
	if config.MpesaFloatLowThresholdKES < 0 || config.MpesaFloatHighThresholdKES < 0 {
		return nil, errors.New("mpesa float thresholds must be non-negative")
	}
	if config.MpesaFloatLowThresholdKES > config.MpesaFloatHighThresholdKES {
		return nil, errors.New("mpesa_float_low_threshold_kes must not exceed mpesa_float_high_threshold_kes")
	}

	if _, err := s.db.Exec(ctx, `
		UPDATE liquidity_config
		SET hot_wallet_min_sats = $1, auto_open_channel_threshold_sats = $2,
		    mpesa_float_low_threshold_kes = $3, mpesa_float_high_threshold_kes = $4,
		    updated_at = NOW()
		WHERE id = 1
	`, config.HotWalletMinSats, config.AutoOpenChannelThresholdSats, config.MpesaFloatLowThresholdKES, config.MpesaFloatHighThresholdKES); err != nil {
		return nil, err
	}
	return s.GetConfig(ctx)
}

// GetActionLog returns the most recent liquidity management actions, newest
// first.
func (s *Service) GetActionLog(ctx context.Context, limit int) ([]ActionLogEntry, error) {
	if limit <= 0 {
		limit = 20
	}
	if limit > 100 {
		limit = 100
	}

	rows, err := s.db.Query(ctx, `
		SELECT l.action_type, l.channel_id, l.detail, u.name, l.created_at
		FROM liquidity_action_log l
		LEFT JOIN users u ON u.id = l.performed_by
		ORDER BY l.created_at DESC
		LIMIT $1
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	entries := []ActionLogEntry{}
	for rows.Next() {
		var e ActionLogEntry
		var createdAt time.Time
		if err := rows.Scan(&e.ActionType, &e.ChannelID, &e.Detail, &e.PerformedByName, &createdAt); err != nil {
			return nil, err
		}
		e.CreatedAt = createdAt.Format(time.RFC3339)
		entries = append(entries, e)
	}
	return entries, rows.Err()
}

// OpenChannel opens a new channel to a peer, funded from on-chain reserves.
func (s *Service) OpenChannel(ctx context.Context, userID string, req OpenChannelRequest) (*Channel, error) {
	if req.PeerAlias == "" {
		return nil, errors.New("peer_alias is required")
	}
	if req.CapacitySats <= 0 {
		return nil, errors.New("capacity_sats must be positive")
	}

	tx, err := s.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	var onchain int64
	if err := tx.QueryRow(ctx, `SELECT onchain_confirmed_sats FROM ln_node_status WHERE id = 1 FOR UPDATE`).Scan(&onchain); err != nil {
		return nil, err
	}
	if req.CapacitySats > onchain {
		return nil, fmt.Errorf("capacity_sats (%d) exceeds on-chain confirmed balance (%d)", req.CapacitySats, onchain)
	}

	channelID := fmt.Sprintf("manual-%d", time.Now().UnixNano())
	peerPubkey := fmt.Sprintf("03%x", time.Now().UnixNano())

	if _, err := tx.Exec(ctx, `
		INSERT INTO ln_channels (channel_id, peer_alias, peer_pubkey, capacity_sats, local_balance_sats, remote_balance_sats, status)
		VALUES ($1, $2, $3, $4, $4, 0, 'active')
	`, channelID, req.PeerAlias, peerPubkey, req.CapacitySats); err != nil {
		return nil, err
	}

	if _, err := tx.Exec(ctx, `
		UPDATE ln_node_status SET onchain_confirmed_sats = onchain_confirmed_sats - $1 WHERE id = 1
	`, req.CapacitySats); err != nil {
		return nil, err
	}

	detail := fmt.Sprintf("Opened channel to %s with %d sats", req.PeerAlias, req.CapacitySats)
	if err := s.logAction(ctx, tx, &userID, "open_channel", &channelID, detail); err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	return &Channel{
		ChannelID:         channelID,
		PeerAlias:         req.PeerAlias,
		PeerPubkey:        peerPubkey,
		CapacitySats:      req.CapacitySats,
		LocalBalanceSats:  req.CapacitySats,
		RemoteBalanceSats: 0,
		LocalRatioPct:     100,
		FeeRatePPM:        1000,
		BaseFeeMsat:       1000,
		Status:            "active",
		Health:            "needs_rebalance",
	}, nil
}

// CloseChannel closes a channel, returning its local balance to the on-chain
// reserve.
func (s *Service) CloseChannel(ctx context.Context, userID, channelID string) error {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var peerAlias string
	var localBalance int64
	if err := tx.QueryRow(ctx, `
		SELECT peer_alias, local_balance_sats FROM ln_channels WHERE channel_id = $1 FOR UPDATE
	`, channelID).Scan(&peerAlias, &localBalance); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return errors.New("channel not found")
		}
		return err
	}

	if _, err := tx.Exec(ctx, `DELETE FROM ln_channels WHERE channel_id = $1`, channelID); err != nil {
		return err
	}

	if _, err := tx.Exec(ctx, `
		UPDATE ln_node_status SET onchain_confirmed_sats = onchain_confirmed_sats + $1 WHERE id = 1
	`, localBalance); err != nil {
		return err
	}

	detail := fmt.Sprintf("Closed channel to %s, returning %d sats on-chain", peerAlias, localBalance)
	if err := s.logAction(ctx, tx, &userID, "close_channel", &channelID, detail); err != nil {
		return err
	}

	return tx.Commit(ctx)
}

// UpdateChannelFee sets a channel's forwarding fee policy.
func (s *Service) UpdateChannelFee(ctx context.Context, userID, channelID string, req UpdateFeeRequest) (*Channel, error) {
	if req.FeeRatePPM < 0 || req.BaseFeeMsat < 0 {
		return nil, errors.New("fee_rate_ppm and base_fee_msat must be non-negative")
	}

	tx, err := s.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	tag, err := tx.Exec(ctx, `
		UPDATE ln_channels SET fee_rate_ppm = $1, base_fee_msat = $2, updated_at = NOW() WHERE channel_id = $3
	`, req.FeeRatePPM, req.BaseFeeMsat, channelID)
	if err != nil {
		return nil, err
	}
	if tag.RowsAffected() == 0 {
		return nil, errors.New("channel not found")
	}

	var c Channel
	if err := tx.QueryRow(ctx, `
		SELECT channel_id, peer_alias, peer_pubkey, capacity_sats, local_balance_sats, remote_balance_sats, fee_rate_ppm, base_fee_msat, status
		FROM ln_channels WHERE channel_id = $1
	`, channelID).Scan(&c.ChannelID, &c.PeerAlias, &c.PeerPubkey, &c.CapacitySats, &c.LocalBalanceSats, &c.RemoteBalanceSats, &c.FeeRatePPM, &c.BaseFeeMsat, &c.Status); err != nil {
		return nil, err
	}
	if c.CapacitySats > 0 {
		c.LocalRatioPct = float64(c.LocalBalanceSats) / float64(c.CapacitySats) * 100
	}
	c.Health = channelHealth(c)

	detail := fmt.Sprintf("Set fee policy for %s to %d ppm / %d msat base", c.PeerAlias, req.FeeRatePPM, req.BaseFeeMsat)
	if err := s.logAction(ctx, tx, &userID, "set_fee", &channelID, detail); err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return &c, nil
}

// Rebalance moves liquidity from one active channel's local balance to
// another's.
func (s *Service) Rebalance(ctx context.Context, userID string, req RebalanceRequest) error {
	if req.FromChannelID == "" || req.ToChannelID == "" {
		return errors.New("from_channel_id and to_channel_id are required")
	}
	if req.FromChannelID == req.ToChannelID {
		return errors.New("from_channel_id and to_channel_id must differ")
	}
	if req.AmountSats <= 0 {
		return errors.New("amount_sats must be positive")
	}

	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	type chanRow struct {
		peerAlias     string
		localBalance  int64
		remoteBalance int64
		status        string
	}
	load := func(id string) (chanRow, error) {
		var c chanRow
		err := tx.QueryRow(ctx, `
			SELECT peer_alias, local_balance_sats, remote_balance_sats, status FROM ln_channels WHERE channel_id = $1 FOR UPDATE
		`, id).Scan(&c.peerAlias, &c.localBalance, &c.remoteBalance, &c.status)
		return c, err
	}

	from, err := load(req.FromChannelID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return errors.New("from_channel_id not found")
		}
		return err
	}
	to, err := load(req.ToChannelID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return errors.New("to_channel_id not found")
		}
		return err
	}
	if from.status != "active" || to.status != "active" {
		return errors.New("both channels must be active")
	}
	if req.AmountSats > from.localBalance {
		return fmt.Errorf("amount_sats (%d) exceeds from-channel local balance (%d)", req.AmountSats, from.localBalance)
	}
	if req.AmountSats > to.remoteBalance {
		return fmt.Errorf("amount_sats (%d) exceeds to-channel remote balance (%d)", req.AmountSats, to.remoteBalance)
	}

	if _, err := tx.Exec(ctx, `
		UPDATE ln_channels SET local_balance_sats = local_balance_sats - $1, remote_balance_sats = remote_balance_sats + $1, updated_at = NOW() WHERE channel_id = $2
	`, req.AmountSats, req.FromChannelID); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `
		UPDATE ln_channels SET local_balance_sats = local_balance_sats + $1, remote_balance_sats = remote_balance_sats - $1, updated_at = NOW() WHERE channel_id = $2
	`, req.AmountSats, req.ToChannelID); err != nil {
		return err
	}

	detail := fmt.Sprintf("Rebalanced %d sats from %s to %s", req.AmountSats, from.peerAlias, to.peerAlias)
	if err := s.logAction(ctx, tx, &userID, "rebalance", nil, detail); err != nil {
		return err
	}

	return tx.Commit(ctx)
}

// ExecuteSwap moves liquidity between the on-chain reserve and a channel's
// Lightning balance.
func (s *Service) ExecuteSwap(ctx context.Context, userID string, req SwapRequest) error {
	if req.AmountSats <= 0 {
		return errors.New("amount_sats must be positive")
	}
	if req.Direction != "onchain_to_lightning" && req.Direction != "lightning_to_onchain" {
		return errors.New("direction must be 'onchain_to_lightning' or 'lightning_to_onchain'")
	}

	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var peerAlias, status string
	var localBalance, remoteBalance int64
	if err := tx.QueryRow(ctx, `
		SELECT peer_alias, local_balance_sats, remote_balance_sats, status FROM ln_channels WHERE channel_id = $1 FOR UPDATE
	`, req.ChannelID).Scan(&peerAlias, &localBalance, &remoteBalance, &status); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return errors.New("channel not found")
		}
		return err
	}
	if status != "active" {
		return errors.New("channel is not active")
	}

	var onchain int64
	if err := tx.QueryRow(ctx, `SELECT onchain_confirmed_sats FROM ln_node_status WHERE id = 1 FOR UPDATE`).Scan(&onchain); err != nil {
		return err
	}

	var detail string
	switch req.Direction {
	case "onchain_to_lightning":
		if req.AmountSats > onchain {
			return fmt.Errorf("amount_sats (%d) exceeds on-chain confirmed balance (%d)", req.AmountSats, onchain)
		}
		if req.AmountSats > remoteBalance {
			return fmt.Errorf("amount_sats (%d) exceeds channel remote balance (%d)", req.AmountSats, remoteBalance)
		}
		if _, err := tx.Exec(ctx, `UPDATE ln_node_status SET onchain_confirmed_sats = onchain_confirmed_sats - $1 WHERE id = 1`, req.AmountSats); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `
			UPDATE ln_channels SET local_balance_sats = local_balance_sats + $1, remote_balance_sats = remote_balance_sats - $1, updated_at = NOW() WHERE channel_id = $2
		`, req.AmountSats, req.ChannelID); err != nil {
			return err
		}
		detail = fmt.Sprintf("Swapped %d sats on-chain -> %s (Lightning)", req.AmountSats, peerAlias)
	case "lightning_to_onchain":
		if req.AmountSats > localBalance {
			return fmt.Errorf("amount_sats (%d) exceeds channel local balance (%d)", req.AmountSats, localBalance)
		}
		if _, err := tx.Exec(ctx, `
			UPDATE ln_channels SET local_balance_sats = local_balance_sats - $1, remote_balance_sats = remote_balance_sats + $1, updated_at = NOW() WHERE channel_id = $2
		`, req.AmountSats, req.ChannelID); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `UPDATE ln_node_status SET onchain_confirmed_sats = onchain_confirmed_sats + $1 WHERE id = 1`, req.AmountSats); err != nil {
			return err
		}
		detail = fmt.Sprintf("Swapped %d sats %s (Lightning) -> on-chain", req.AmountSats, peerAlias)
	}

	if err := s.logAction(ctx, tx, &userID, "swap", &req.ChannelID, detail); err != nil {
		return err
	}

	return tx.Commit(ctx)
}

// MpesaReplenish increases the M-Pesa float balance.
func (s *Service) MpesaReplenish(ctx context.Context, userID string, amountKES float64) error {
	if amountKES <= 0 {
		return errors.New("amount_kes must be positive")
	}

	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `
		UPDATE liquidity_config SET mpesa_float_balance_kes = mpesa_float_balance_kes + $1, updated_at = NOW() WHERE id = 1
	`, amountKES); err != nil {
		return err
	}

	detail := fmt.Sprintf("Replenished M-Pesa float by %.2f KES", amountKES)
	if err := s.logAction(ctx, tx, &userID, "mpesa_replenish", nil, detail); err != nil {
		return err
	}

	return tx.Commit(ctx)
}

// MpesaSweep decreases the M-Pesa float balance.
func (s *Service) MpesaSweep(ctx context.Context, userID string, amountKES float64) error {
	if amountKES <= 0 {
		return errors.New("amount_kes must be positive")
	}

	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var balance float64
	if err := tx.QueryRow(ctx, `SELECT mpesa_float_balance_kes FROM liquidity_config WHERE id = 1 FOR UPDATE`).Scan(&balance); err != nil {
		return err
	}
	if amountKES > balance {
		return fmt.Errorf("amount_kes (%.2f) exceeds current float balance (%.2f)", amountKES, balance)
	}

	if _, err := tx.Exec(ctx, `
		UPDATE liquidity_config SET mpesa_float_balance_kes = mpesa_float_balance_kes - $1, updated_at = NOW() WHERE id = 1
	`, amountKES); err != nil {
		return err
	}

	detail := fmt.Sprintf("Swept %.2f KES from M-Pesa float", amountKES)
	if err := s.logAction(ctx, tx, &userID, "mpesa_sweep", nil, detail); err != nil {
		return err
	}

	return tx.Commit(ctx)
}

// RunAutomation appends today's routing fee revenue, auto-opens a channel if
// hot liquidity is too low, and auto-replenishes/sweeps the M-Pesa float
// against its configured thresholds. Intended to be called daily by
// LiquidityWorker.
func (s *Service) RunAutomation(ctx context.Context) error {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	// 1. Append today's routing fee row if missing, as a small random walk
	// from yesterday's value.
	var lastFee int64
	err = tx.QueryRow(ctx, `SELECT fee_sats FROM ln_routing_fee_history ORDER BY snapshot_date DESC LIMIT 1`).Scan(&lastFee)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return err
	}
	nextFee := lastFee + int64(rand.Intn(7)-3)
	if nextFee < 0 {
		nextFee = 0
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO ln_routing_fee_history (snapshot_date, fee_sats) VALUES (CURRENT_DATE, $1)
		ON CONFLICT (snapshot_date) DO NOTHING
	`, nextFee); err != nil {
		return err
	}

	// 2. Auto-open a channel if hot Lightning liquidity is below threshold
	// and there's enough on-chain balance to fund one.
	var totalLocal int64
	if err := tx.QueryRow(ctx, `SELECT COALESCE(SUM(local_balance_sats), 0) FROM ln_channels WHERE status = 'active'`).Scan(&totalLocal); err != nil {
		return err
	}

	var config Config
	if err := tx.QueryRow(ctx, `
		SELECT hot_wallet_min_sats, auto_open_channel_threshold_sats, mpesa_float_balance_kes, mpesa_float_low_threshold_kes, mpesa_float_high_threshold_kes
		FROM liquidity_config WHERE id = 1 FOR UPDATE
	`).Scan(&config.HotWalletMinSats, &config.AutoOpenChannelThresholdSats, &config.MpesaFloatBalanceKES, &config.MpesaFloatLowThresholdKES, &config.MpesaFloatHighThresholdKES); err != nil {
		return err
	}

	var onchain int64
	if err := tx.QueryRow(ctx, `SELECT onchain_confirmed_sats FROM ln_node_status WHERE id = 1 FOR UPDATE`).Scan(&onchain); err != nil {
		return err
	}

	const autoOpenCapacity = 100000
	if totalLocal < config.AutoOpenChannelThresholdSats && onchain >= autoOpenCapacity {
		channelID := fmt.Sprintf("auto-%d", time.Now().UnixNano())
		peerPubkey := fmt.Sprintf("03%x", time.Now().UnixNano())

		if _, err := tx.Exec(ctx, `
			INSERT INTO ln_channels (channel_id, peer_alias, peer_pubkey, capacity_sats, local_balance_sats, remote_balance_sats, status)
			VALUES ($1, 'Auto-Opened LSP', $2, $3, $3, 0, 'active')
		`, channelID, peerPubkey, autoOpenCapacity); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `UPDATE ln_node_status SET onchain_confirmed_sats = onchain_confirmed_sats - $1 WHERE id = 1`, autoOpenCapacity); err != nil {
			return err
		}

		detail := fmt.Sprintf("Auto-opened channel to Auto-Opened LSP with %d sats (hot liquidity %d sats below %d sat threshold)", autoOpenCapacity, totalLocal, config.AutoOpenChannelThresholdSats)
		if err := s.logAction(ctx, tx, nil, "auto_open_channel", &channelID, detail); err != nil {
			return err
		}
	}

	// 3. Auto-replenish or auto-sweep the M-Pesa float to the midpoint of its
	// configured low/high thresholds.
	midpoint := (config.MpesaFloatLowThresholdKES + config.MpesaFloatHighThresholdKES) / 2
	if config.MpesaFloatBalanceKES < config.MpesaFloatLowThresholdKES {
		if _, err := tx.Exec(ctx, `UPDATE liquidity_config SET mpesa_float_balance_kes = $1, updated_at = NOW() WHERE id = 1`, midpoint); err != nil {
			return err
		}
		detail := fmt.Sprintf("Auto-replenished M-Pesa float from %.2f to %.2f KES", config.MpesaFloatBalanceKES, midpoint)
		if err := s.logAction(ctx, tx, nil, "mpesa_auto_replenish", nil, detail); err != nil {
			return err
		}
	} else if config.MpesaFloatBalanceKES > config.MpesaFloatHighThresholdKES {
		if _, err := tx.Exec(ctx, `UPDATE liquidity_config SET mpesa_float_balance_kes = $1, updated_at = NOW() WHERE id = 1`, midpoint); err != nil {
			return err
		}
		detail := fmt.Sprintf("Auto-swept M-Pesa float from %.2f to %.2f KES", config.MpesaFloatBalanceKES, midpoint)
		if err := s.logAction(ctx, tx, nil, "mpesa_auto_sweep", nil, detail); err != nil {
			return err
		}
	}

	return tx.Commit(ctx)
}
