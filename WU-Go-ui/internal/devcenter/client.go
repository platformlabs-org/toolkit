package devcenter

import (
	"net/http"
	"time"
)

type Client struct {
	BaseAPI string
	HTTP    *http.Client
}

func NewClient(baseAPI string) *Client {
	return &Client{
		BaseAPI: baseAPI,
		HTTP: &http.Client{
			Timeout: 180 * time.Second,
		},
	}
}
