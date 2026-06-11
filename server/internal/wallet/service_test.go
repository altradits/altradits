package wallet

import "testing"

func TestFormatSats(t *testing.T) {
	cases := []struct {
		sats int64
		want string
	}{
		{0, "0"},
		{7, "7"},
		{999, "999"},
		{1000, "1,000"},
		{10_000, "10,000"},
		{1_234_567, "1,234,567"},
		{-1_234_567, "-1,234,567"},
	}
	for _, c := range cases {
		if got := formatSats(c.sats); got != c.want {
			t.Errorf("formatSats(%d) = %q, want %q", c.sats, got, c.want)
		}
	}
}
