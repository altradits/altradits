package liquidity

// NodeStatus is the Lightning node's identity, sync state, and a snapshot of
// its peer/channel counts and uptime.
type NodeStatus struct {
	Alias             string `json:"alias"`
	Pubkey            string `json:"pubkey"`
	BlockHeight       int64  `json:"block_height"`
	SyncedToChain     bool   `json:"synced_to_chain"`
	Version           string `json:"version"`
	NumPeers          int    `json:"num_peers"`
	NumActiveChannels int    `json:"num_active_channels"`
	UptimeSeconds     int64  `json:"uptime_seconds"`
}

// Channel is a single Lightning channel, with its capacity/balance split and
// a derived health classification for the dashboard's heatmap and alerts.
type Channel struct {
	ChannelID         string  `json:"channel_id"`
	PeerAlias         string  `json:"peer_alias"`
	PeerPubkey        string  `json:"peer_pubkey"`
	CapacitySats      int64   `json:"capacity_sats"`
	LocalBalanceSats  int64   `json:"local_balance_sats"`
	RemoteBalanceSats int64   `json:"remote_balance_sats"`
	LocalRatioPct     float64 `json:"local_ratio_pct"`
	FeeRatePPM        int     `json:"fee_rate_ppm"`
	BaseFeeMsat       int     `json:"base_fee_msat"`
	Status            string  `json:"status"`
	// Health is derived from Status/LocalRatioPct: "zombie" (inactive),
	// "needs_rebalance" (local ratio <20% or >80%), or "balanced".
	Health string `json:"health"`
}

// ChannelsResponse is the full channel list plus aggregate totals across
// active channels.
type ChannelsResponse struct {
	Channels          []Channel `json:"channels"`
	TotalLocalSats    int64     `json:"total_local_sats"`
	TotalRemoteSats   int64     `json:"total_remote_sats"`
	TotalCapacitySats int64     `json:"total_capacity_sats"`
}

// Peer is a known Lightning network peer, connected or not.
type Peer struct {
	Pubkey    string `json:"pubkey"`
	Alias     string `json:"alias"`
	Address   string `json:"address"`
	Connected bool   `json:"connected"`
}

// OnchainTx is a single on-chain deposit or withdrawal affecting the node's
// cold-storage reserve.
type OnchainTx struct {
	Direction     string `json:"direction"`
	AmountSats    int64  `json:"amount_sats"`
	Txid          string `json:"txid"`
	Confirmations int    `json:"confirmations"`
	CreatedAt     string `json:"created_at"`
}

// OnchainInfo is the node's on-chain BTC reserve balance and recent
// transaction history.
type OnchainInfo struct {
	ConfirmedSats   int64       `json:"confirmed_sats"`
	UnconfirmedSats int64       `json:"unconfirmed_sats"`
	Transactions    []OnchainTx `json:"transactions"`
}

// RoutingFeePoint is a single day's routing fee revenue.
type RoutingFeePoint struct {
	Date    string `json:"date"`
	FeeSats int64  `json:"fee_sats"`
}

// MpesaQueueEntry is a single pending M-Pesa deposit or withdrawal awaiting
// conversion to/from sats.
type MpesaQueueEntry struct {
	ID         string  `json:"id"`
	UserName   string  `json:"user_name"`
	AmountSats int64   `json:"amount_sats"`
	AmountKES  float64 `json:"amount_kes"`
	CreatedAt  string  `json:"created_at"`
}

// MpesaQueues holds the pending M-Pesa deposit (Mpesa -> sats) and withdrawal
// (sats -> Mpesa) queues.
type MpesaQueues struct {
	Deposits    []MpesaQueueEntry `json:"deposits"`
	Withdrawals []MpesaQueueEntry `json:"withdrawals"`
}

// Overview is the node operator's top-level snapshot: Lightning + on-chain
// liquidity, pending M-Pesa settlement, and routing fee revenue.
type Overview struct {
	TotalLocalSats           int64 `json:"total_local_sats"`
	TotalRemoteSats          int64 `json:"total_remote_sats"`
	TotalCapacitySats        int64 `json:"total_capacity_sats"`
	OnchainConfirmedSats     int64 `json:"onchain_confirmed_sats"`
	OnchainUnconfirmedSats   int64 `json:"onchain_unconfirmed_sats"`
	PendingMpesaDepositSats  int64 `json:"pending_mpesa_deposit_sats"`
	PendingMpesaWithdrawSats int64 `json:"pending_mpesa_withdraw_sats"`
	RoutingFeesTodaySats     int64 `json:"routing_fees_today_sats"`
	RoutingFees30dSats       int64 `json:"routing_fees_30d_sats"`
}

// Alert is a single liquidity/node-operations alert surfaced on the
// dashboard.
type Alert struct {
	Severity string `json:"severity"` // "info" | "warning" | "critical"
	Title    string `json:"title"`
	Detail   string `json:"detail"`
}

// Config holds the liquidity manager's thresholds for hot-wallet liquidity,
// auto-opening channels, and the M-Pesa float.
type Config struct {
	HotWalletMinSats             int64   `json:"hot_wallet_min_sats"`
	AutoOpenChannelThresholdSats int64   `json:"auto_open_channel_threshold_sats"`
	MpesaFloatBalanceKES         float64 `json:"mpesa_float_balance_kes"`
	MpesaFloatLowThresholdKES    float64 `json:"mpesa_float_low_threshold_kes"`
	MpesaFloatHighThresholdKES   float64 `json:"mpesa_float_high_threshold_kes"`
}

// ActionLogEntry is a single recorded channel/swap/float management action,
// manual or automated.
type ActionLogEntry struct {
	ActionType      string  `json:"action_type"`
	ChannelID       *string `json:"channel_id"`
	Detail          string  `json:"detail"`
	PerformedByName *string `json:"performed_by_name"`
	CreatedAt       string  `json:"created_at"`
}

// OpenChannelRequest opens a new channel to a peer, funded from on-chain
// reserves.
type OpenChannelRequest struct {
	PeerAlias    string `json:"peer_alias"`
	CapacitySats int64  `json:"capacity_sats"`
}

// UpdateFeeRequest sets a channel's forwarding fee policy.
type UpdateFeeRequest struct {
	FeeRatePPM  int `json:"fee_rate_ppm"`
	BaseFeeMsat int `json:"base_fee_msat"`
}

// RebalanceRequest moves liquidity from one channel's local balance to
// another's.
type RebalanceRequest struct {
	FromChannelID string `json:"from_channel_id"`
	ToChannelID   string `json:"to_channel_id"`
	AmountSats    int64  `json:"amount_sats"`
}

// SwapRequest executes a submarine swap between on-chain reserves and a
// channel's Lightning balance.
type SwapRequest struct {
	Direction  string `json:"direction"` // "onchain_to_lightning" | "lightning_to_onchain"
	ChannelID  string `json:"channel_id"`
	AmountSats int64  `json:"amount_sats"`
}

// FloatAdjustRequest replenishes or sweeps the M-Pesa float by a given KES
// amount.
type FloatAdjustRequest struct {
	AmountKES float64 `json:"amount_kes"`
}
