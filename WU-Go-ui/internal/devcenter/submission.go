package devcenter

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

	"WU-Go-ui/internal/support"
)

func GetSubmission(ctx context.Context, c *Client, token, productID, submissionID string) (map[string]any, error) {
	u := fmt.Sprintf("%s/products/%s/submissions/%s", c.BaseAPI, productID, submissionID)

	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/json")

	resp, err := c.HTTP.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, support.NewAPIError(fmt.Sprintf("GET submission Failed: %d\n%s", resp.StatusCode, string(body)))
	}

	var obj map[string]any
	if err := json.Unmarshal(body, &obj); err != nil {
		return nil, support.NewAPIError("submission response is not a valid JSON object: " + err.Error())
	}
	return obj, nil
}

func FindDriverMetadataURL(submission map[string]any) (string, error) {
	// downloads.items[].type == driverMetadata => url
	if downloads, ok := submission["downloads"].(map[string]any); ok {
		if items, ok := downloads["items"].([]any); ok {
			for _, it := range items {
				obj, _ := it.(map[string]any)
				if obj == nil {
					continue
				}
				t, _ := obj["type"].(string)
				if strings.EqualFold(t, "driverMetadata") {
					u, _ := obj["url"].(string)
					if !support.IsBlank(u) {
						return u, nil
					}
				}
			}
		}
	}
	// links[].rel == driverMetadata => href
	if links, ok := submission["links"].([]any); ok {
		for _, lk := range links {
			obj, _ := lk.(map[string]any)
			if obj == nil {
				continue
			}
			rel, _ := obj["rel"].(string)
			if strings.EqualFold(rel, "driverMetadata") {
				h, _ := obj["href"].(string)
				if !support.IsBlank(h) {
					return h, nil
				}
			}
		}
	}
	return "", support.NewAPIError("DriverMetadata URL not found in submission (neither in downloads.items nor links)")
}
