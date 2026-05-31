package shared

// EventType represents a system event.
type EventType string

// System events.
const (
	TransactionCreated EventType = "transaction_created"
	SMSReceived        EventType = "sms_received"
	TodoCreated        EventType = "todo_created"
	GoalUpdated        EventType = "goal_updated"
	DayClosed          EventType = "day_closed"
	BirthdayNear       EventType = "birthday_near"
	SalaryReceived     EventType = "salary_received"
	SubscriptionDetected EventType = "subscription_detected"
)