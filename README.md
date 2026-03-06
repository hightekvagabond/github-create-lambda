# GitHub Repo Creator Lambda

A minimal AWS Lambda that **only creates** GitHub repositories. No delete, no update, no other operations. Built for AI agent workflows where you want to grant repo creation without giving destructive permissions.

## Why?

GitHub's fine-grained tokens bundle "create" and "delete" under the same Administration permission. If you're giving an AI agent (or any automation) access to create repos, you're also giving it the power to delete them.

This Lambda enforces **least privilege at the infrastructure level**:
- The Lambda code physically cannot delete repos — there's no delete endpoint
- GitHub tokens are stored server-side — the caller never sees them
- API key required on all requests — no anonymous access
- Rate limited to prevent abuse

## Architecture

```
Caller (AI Agent / Script)
  → API Gateway (requires x-api-key)
    → Lambda (creates repo via GitHub API)
      → Uses TOKEN_* env vars to authenticate
```

## Token Convention

Tokens are stored as Lambda environment variables with the prefix `TOKEN_`:

```
TOKEN_mypersonal=github_pat_abc123...
TOKEN_mycompany=github_pat_def456...
TOKEN_clientaccount=github_pat_ghi789...
```

- The label after `TOKEN_` is what callers use to specify which account to create under
- Add unlimited tokens — one per GitHub account/org you want to create repos for
- Each token needs the **Administration: Read and write** permission on the target account/org
- For org repos, the token must be scoped to the organization

## Endpoints

### `GET /tokens`

List available token labels with hints (first 10 + last 5 chars) for debugging.

**Headers:** `x-api-key: your-api-key`

**Response:**
```json
{
  "tokens": [
    {"label": "mypersonal", "hint": "github_pat...xY4z5"},
    {"label": "mycompany", "hint": "github_pat...aBcDe"}
  ]
}
```

### `POST /create`

Create a GitHub repository.

**Headers:** `x-api-key: your-api-key`, `Content-Type: application/json`

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
| `private` | No | `true` | Whether the repo is private (**safe default**) |
| `org` | No | — | Create under this GitHub org instead of the user account |
| `auto_init` | No | — | Initialize with a README |
| `default_branch` | No | — | Default branch name (requires `auto_init: true`) |
| `gitignore_template` | No | — | `.gitignore` template (e.g., `"Node"`, `"Python"`, `"Go"`) |

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

| Code | Meaning |
|------|---------|
| 400 | Bad request — missing fields, invalid token label |
| 401/403 | GitHub auth failed — token invalid or lacks permissions |
| 404 | Org not found or token doesn't have access |
| 409 | Repo already exists |
| 422 | GitHub validation error |

## Deployment

### Prerequisites

- Docker
- AWS CLI configured with a profile that has Lambda/CloudFormation/API Gateway permissions
- A GitHub Personal Access Token (fine-grained) with **Administration: Read and write**

### Deploy

```bash
git clone https://github.com/hightekvagabond/github-create-lambda.git
cd github-create-lambda
./deploy.sh
```

The deploy script:
1. Asks for your AWS profile, region, and stack name
2. Builds and deploys everything inside a Docker container (no SAM CLI install needed)
3. Creates the Lambda, API Gateway, API key, and usage plan

**Only requires Docker and bash on your machine. Nothing else.**

### After Deployment

1. **Get your API Gateway URL:**
   ```bash
   aws cloudformation describe-stacks \
     --stack-name github-create-lambda \
     --profile YOUR_PROFILE \
     --query 'Stacks[0].Outputs' --output table
   ```

2. **Get your API key:**
   ```bash
   aws apigateway get-api-keys \
     --profile YOUR_PROFILE \
     --include-values \
     --query 'items[?name==`github-create-lambda-key`].value' \
     --output text
   ```

3. **Add your GitHub tokens:**
   ```bash
   aws lambda update-function-configuration \
     --profile YOUR_PROFILE \
     --function-name FUNCTION_NAME_FROM_OUTPUTS \
     --environment 'Variables={TOKEN_mypersonal=github_pat_xxx,TOKEN_mycompany=github_pat_yyy}'
   ```

   ⚠️ **The `--environment` flag replaces ALL env vars.** Always include every token in one command.

4. **Test it:**
   ```bash
   # List tokens
   curl -H "x-api-key: YOUR_KEY" https://YOUR_API_URL/tokens

   # Create a repo
   curl -X POST https://YOUR_API_URL/create \
     -H "x-api-key: YOUR_KEY" \
     -H "Content-Type: application/json" \
     -d '{"token":"mypersonal","name":"test-repo","private":true,"auto_init":true}'
   ```

### Adding More Tokens Later

```bash
aws lambda update-function-configuration \
  --profile YOUR_PROFILE \
  --function-name FUNCTION_NAME \
  --environment 'Variables={TOKEN_existing=ghp_xxx,TOKEN_newone=ghp_yyy}'
```

⚠️ Include ALL tokens every time — this command replaces, not appends.

### Redeployment Notes

- `./deploy.sh` can be run again safely for code updates
- Environment variables (tokens) **survive redeployment** as long as the Lambda function isn't recreated
- The API Gateway URL and API key may change on redeploy — check outputs after
- `samconfig.toml` is gitignored — your deployment config stays local

## Security

- **API key required** on all endpoints (403 without it)
- **Rate limited** — 10 requests/second, burst of 20
- Tokens are **only** in Lambda environment variables, never in code or logs
- GitHub API responses are filtered — only safe fields returned to caller
- **Private repos by default** — if you forget `"private": true`, it defaults to private
- **No destructive operations exist in the codebase** — physically cannot delete or modify repos
- Input is strictly validated (repo name pattern, length limits, type checks)

## Tech Stack

- **Runtime:** Node.js 20 (ARM64 for cost efficiency)
- **HTTP Client:** Native `fetch` (no dependencies)
- **Infrastructure:** AWS SAM (CloudFormation)
- **Deploy:** Docker-based (no host dependencies beyond Docker + bash)

## Use Cases

- **AI agents** that need to create repos without destructive access
- **CI/CD pipelines** that scaffold new projects
- **Internal tools** where you want a controlled repo creation flow
- **Multi-account setups** where different teams/projects use different GitHub accounts

## License

MIT
