package services

type URSnapshot struct {
	A int `json:"a"`
	B int `json:"b"`
	C int `json:"c"`
	D int `json:"d"`

	Valid bool   `json:"valid"`
	TS    string `json:"ts"` // RFC3339
}

type URDiff struct {
	Pipe string `json:"pipe"` // A/B/C/D
	Prev int    `json:"prev"`
	Curr int    `json:"curr"`
}

type URChange struct {
	Prev      URSnapshot `json:"prev"`
	Curr      URSnapshot `json:"curr"`
	Diffs     []URDiff   `json:"diffs"`
	ChangedAt string     `json:"changedAt"`
}

type UREvent struct {
	Type    string
	Payload interface{}
}

type UpdateCallback func(evt UREvent)
