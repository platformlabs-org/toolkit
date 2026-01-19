package main

import (
	"context"
	"path/filepath"
	"os"

	"WU-Go-ui/internal/auth"
	"WU-Go-ui/internal/devcenter"
	"WU-Go-ui/internal/drivermeta"
	"WU-Go-ui/internal/shippinglabel"
	"WU-Go-ui/internal/support"
)

// App struct
type App struct {
	ctx        context.Context
	httpClient *devcenter.Client
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{
		httpClient: devcenter.NewClient("https://manage.devcenter.microsoft.com/v2.0/my/hardware"),
	}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

// Config Methods

func (a *App) LoadConfig() (*auth.Credential, error) {
	path := a.getCredentialPath()
	return auth.LoadCredential(path), nil
}

func (a *App) SaveConfig(c auth.Credential) error {
	path := a.getCredentialPath()
	auth.SaveCredential(path, &c)
	return nil
}

func (a *App) getCredentialPath() string {
	// Attempt to store in same dir as executable, fallback to local
	exe, err := os.Executable()
	if err != nil {
		return "credential.json"
	}
	return filepath.Join(filepath.Dir(exe), "credential.json")
}

// Auth Methods

func (a *App) AcquireToken(tenantID, clientID, clientSecret string) (string, error) {
	return auth.AcquireToken(a.ctx, a.httpClient.HTTP, tenantID, clientID, clientSecret)
}

// Submission Methods

func (a *App) GetSubmission(token, productID, submissionID string) (map[string]any, error) {
	if support.IsBlank(productID) || support.IsBlank(submissionID) {
		return nil, support.NewAPIError("Product ID and Submission ID are required")
	}
	return devcenter.GetSubmission(a.ctx, a.httpClient, token, productID, submissionID)
}

// Metadata Methods

func (a *App) AnalyzeMetadata(token string, submission map[string]any) (*drivermeta.ParseResult, error) {
	url, err := devcenter.FindDriverMetadataURL(submission)
	if err != nil {
		return nil, err
	}

	metaRoot, err := devcenter.DownloadDriverMetadata(a.ctx, a.httpClient, token, url)
	if err != nil {
		return nil, err
	}

	return drivermeta.Parse(metaRoot)
}

// Label Methods

func (a *App) CreateShippingLabel(
	token, productID, submissionID string,
	options shippinglabel.LabelOptions,
	name string,
	targets []drivermeta.HardwareTarget,
	chids []string,
) (map[string]any, error) {

	if support.IsBlank(name) {
		return nil, support.NewAPIError("Shipping label name is required")
	}

	payload, err := shippinglabel.BuildPayload(options, name, targets, chids)
	if err != nil {
		return nil, err
	}

	return devcenter.CreateShippingLabel(a.ctx, a.httpClient, token, productID, submissionID, payload)
}
