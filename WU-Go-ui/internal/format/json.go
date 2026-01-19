package format

import "encoding/json"

func MustJSON(v any) []byte {
	b, _ := json.Marshal(v)
	return b
}

func MustJSONIndent(v any) []byte {
	b, _ := json.MarshalIndent(v, "", "  ")
	return b
}
