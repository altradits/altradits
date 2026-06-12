package wallet

import "testing"

func TestSatsToBTC(t *testing.T) {
	cases := []struct {
		sats int64
		want float64
	}{
		{0, 0},
		{SatsPerBTC, 1},
		{50_000_000, 0.5},
		{1, 0.00000001},
	}
	for _, c := range cases {
		if got := SatsToBTC(c.sats); got != c.want {
			t.Errorf("SatsToBTC(%d) = %v, want %v", c.sats, got, c.want)
		}
	}
}

func TestSatsToKES(t *testing.T) {
	rate := ExchangeRate{BTCToKES: 13_000_000}

	if got, want := SatsToKES(0, rate), 0.0; got != want {
		t.Errorf("SatsToKES(0, rate) = %v, want %v", got, want)
	}
	if got, want := SatsToKES(SatsPerBTC, rate), 13_000_000.0; got != want {
		t.Errorf("SatsToKES(1 BTC, rate) = %v, want %v", got, want)
	}
	if got, want := SatsToKES(50_000_000, rate), 6_500_000.0; got != want {
		t.Errorf("SatsToKES(0.5 BTC, rate) = %v, want %v", got, want)
	}
}

func TestKESToSats(t *testing.T) {
	rate := ExchangeRate{BTCToKES: 13_000_000}

	if got, want := KESToSats(13_000_000, rate), int64(SatsPerBTC); got != want {
		t.Errorf("KESToSats(13_000_000, rate) = %d, want %d", got, want)
	}
	if got, want := KESToSats(6_500_000, rate), int64(50_000_000); got != want {
		t.Errorf("KESToSats(6_500_000, rate) = %d, want %d", got, want)
	}
}

func TestKESToSatsZeroRate(t *testing.T) {
	rate := ExchangeRate{BTCToKES: 0}
	if got := KESToSats(1000, rate); got != 0 {
		t.Errorf("KESToSats(1000, zero rate) = %d, want 0", got)
	}
}
