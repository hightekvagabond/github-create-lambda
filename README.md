# GitHub Repo Creator Lambda

A minimal AWS Lambda that **only creates** GitHub repositories. No delete, no update, no other operations. Designed for least-privilege automation.

## Token Convention

Tokens are stored as environment variables with the prefix `TOKEN_`:

```
TOKEN_mypersonal=ghp_abc123...
TOKEN_mycompany=ghp_def456...
TOKEN_friendsaccount=ghp_ghi789...
```

The label after `TOKEN_` is what callers use to specify which account to create under.

## Endpoints

### `GET /tokens`

List available token labels.

**Response:**
```json
{
  "tokens": ["mypersonal", "mycompany", "friendsaccount"]
}
```

### `POST /create`

Create a GitHub repository.

**Request body:**
```json
{
  "token": "mypersonal",
  "name": "my-new-repo",
  "description": "A cool project",
  "private": true,
  "org": "optional-org-name",
  "auto_init": true,
  "default_branch": "main",
  "gitignore_template": "Node"
}
```

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `token` | Yes | — | Token label to use (from `TOKEN_*` env vars) |
| `name` | Yes | — | Repository name |
| `description` | No | — | Repository description |
| `private` | No | `true` | Whether the repo is private (safe default) |
| `org` | No | — | Create under this org instead of the user account |
| `auto_init` | No | — | Initialize with a README |
| `default_branch` | No | — | Default branch name (requires `auto_init: true`) |
| `gitignore_template` | No | — | .gitignore template (e.g., "Node", "Python") |

**Success response (201):**
```json
{
  "full_name": "username/my-new-repo",
  "html_url": "https://github.com/username/my-new-repo",
  "clone_url": "https://github.com/username/my-new-repo.git",
  "ssh_url": "git@github.com:username/my-new-repo.git",
  "private": true,
  "default_branch": "main"
}
```

**Error responses:**
- `400` — Bad request (missing fields, invalid token label)
- `401/403` — GitHub auth failed
- `404` — Org not found
- `409` — Repo already exists
- `422` — GitHub validation error

## Deployment

### AWS SAM

```bash
sam build
sam deploy --guided
```

Set environment variables in the SAM template or via AWS Console after deployment.

### Manual

1. Zip the contents: `zip -r function.zip index.mjs package.json`
2. Create Lambda (Node.js 20 runtime)
3. Add API Gateway trigger (REST or HTTP API)
4. Set `TOKEN_*` environment variables in Lambda configuration

## Security

- Tokens are **only** in environment variables, never in code
- No tokens are logged
- Private repos by default
- **This function can ONLY create repos** — no destructive operations exist in the code
- Input is strictly validated

## Adding a New Token

1. Go to AWS Lambda Console → your function → Configuration → Environment Variables
2. Add `TOKEN_yourlabel` with the GitHub PAT value
3. The new label will immediately appear in `GET /tokens`
