package wallet

import "testing"

func TestNormalizeMpesaPhone(t *testing.T) {
	cases := []struct {
		input string
		want  string
	}{
		{"0712345678", "254712345678"},
		{"0112345678", "254112345678"},
		{"254712345678", "254712345678"},
		{"+254712345678", "254712345678"},
		{"712345678", "254712345678"},
		{"  0712 345 678  ", "254712345678"},
	}
	for _, c := range cases {
		got, err := NormalizeMpesaPhone(c.input)
		if err != nil {
			t.Errorf("NormalizeMpesaPhone(%q) returned error: %v", c.input, err)
			continue
		}
		if got != c.want {
			t.Errorf("NormalizeMpesaPhone(%q) = %q, want %q", c.input, got, c.want)
		}
	}
}

func TestNormalizeMpesaPhoneInvalid(t *testing.T) {
	invalid := []string{
		"",
		"12345",
		"0612345678",
		"254812345678",
		"+1234567890",
		"07123456789",
	}
	for _, input := range invalid {
		if _, err := NormalizeMpesaPhone(input); err == nil {
			t.Errorf("NormalizeMpesaPhone(%q) expected an error, got nil", input)
		}
	}
}
