package auth

import (
	"encoding/json"
	"os"
)

type Credential struct {
	TenantID     string   `json:"TenantId"`
	ClientID     string   `json:"ClientId"`
	ClientSecret string   `json:"ClientSecret"`

	// sample fields preserved for parity
	MsContact              string   `json:"MsContact"`
	ValidationsPerformed   string   `json:"ValidationsPerformed"`
	AffectedOems           []string `json:"AffectedOems"`
	BusinessJustification  string   `json:"BusinessJustification"`
}

func defaultCredential() *Credential {
	return &Credential{
		TenantID: "",
		ClientID: "",
		ClientSecret: "",
		MsContact: "feizh@microsoft.com",
		ValidationsPerformed: "Product assurance team full range tested",
		AffectedOems: []string{"N/A"},
		BusinessJustification: "to meet MDA requirements",
	}
}

func LoadCredential(path string) *Credential {
	b, err := os.ReadFile(path)
	if err != nil || len(b) == 0 {
		return defaultCredential()
	}
	var c Credential
	if err := json.Unmarshal(b, &c); err != nil {
		return defaultCredential()
	}
	if c.AffectedOems == nil {
		c.AffectedOems = []string{"N/A"}
	}
	return &c
}

func SaveCredential(path string, c *Credential) {
	b, err := json.MarshalIndent(c, "", "  ")
	if err != nil {
		return
	}
	_ = os.WriteFile(path, b, 0644)
}
