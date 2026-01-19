package auth

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"

	"WU-Go-ui/internal/support"
)


func AcquireToken(ctx context.Context, httpClient *http.Client, tenantID, clientID, clientSecret string) (string, error) {
	u := fmt.Sprintf("https://login.microsoftonline.com/%s/oauth2/token", tenantID)

	form := url.Values{}
	form.Set("grant_type", "client_credentials")
	form.Set("client_id", clientID)
	form.Set("client_secret", clientSecret)
	form.Set("resource", "https://manage.devcenter.microsoft.com")

	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, u, strings.NewReader(form.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", support.NewAPIError(fmt.Sprintf("Acquire Token Failed: %d\n%s", resp.StatusCode, string(body)))
	}

	var obj map[string]any
	if err := json.Unmarshal(body, &obj); err != nil {
		return "", support.NewAPIError("Token response invalid JSON: " + err.Error())
	}

	token, _ := obj["access_token"].(string)
	if support.IsBlank(token) {
		return "", support.NewAPIError("Response missing access_token: " + string(body))
	}
	return token, nil
}
