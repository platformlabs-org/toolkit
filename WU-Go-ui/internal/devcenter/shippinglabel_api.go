package devcenter

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

	"WU-Go-ui/internal/format"
	"WU-Go-ui/internal/support"
)

func DownloadDriverMetadata(ctx context.Context, c *Client, token, u string) (map[string]any, error) {
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	req.Header.Set("Accept", "application/json")

	if strings.Contains(strings.ToLower(u), "manage.devcenter.microsoft.com") {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	resp, err := c.HTTP.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, support.NewAPIError(fmt.Sprintf("GET driverMetadata Failed: %d\n%s", resp.StatusCode, string(body)))
	}

	var obj map[string]any
	if err := json.Unmarshal(body, &obj); err != nil {
		return nil, support.NewAPIError("driverMetadata is not valid JSON:\n" + err.Error())
	}
	return obj, nil
}

func CreateShippingLabel(ctx context.Context, c *Client, token, productID, submissionID string, bodyObj map[string]any) (map[string]any, error) {
	u := fmt.Sprintf("%s/products/%s/submissions/%s/shippingLabels", c.BaseAPI, productID, submissionID)
	b := format.MustJSON(bodyObj)

	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, u, bytes.NewReader(b))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.HTTP.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	text, _ := io.ReadAll(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, support.NewAPIError(fmt.Sprintf("POST /shippingLabels Failed: %d\n%s", resp.StatusCode, string(text)))
	}

	var obj map[string]any
	if err := json.Unmarshal(text, &obj); err != nil {
		return map[string]any{}, nil
	}
	return obj, nil
}
