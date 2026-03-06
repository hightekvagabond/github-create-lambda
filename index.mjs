/**
 * AWS Lambda function to create GitHub repositories.
 *
 * Environment variables use a naming convention:
 *   TOKEN_<label> — GitHub PAT associated with that label
 *
 * Examples:
 *   TOKEN_mypersonal       — Personal GitHub account
 *   TOKEN_ig               — Imagination Guild org
 *   TOKEN_mygfspersonal    — Someone else's account
 *
 * The caller specifies which token to use via the "token" field in the
 * request body. A GET /tokens endpoint lists available token labels.
 */

const GITHUB_API = "https://api.github.com";
const TOKEN_PREFIX = "TOKEN_";
const REPO_NAME_PATTERN = /^[a-zA-Z0-9._-]+$/;

/**
 * Discover all available token labels from environment variables.
 * Returns an array of label strings (e.g. ["mypersonal", "ig"]).
 */
function discoverTokenLabels() {
  return Object.keys(process.env)
    .filter((key) => key.startsWith(TOKEN_PREFIX) && process.env[key])
    .map((key) => key.slice(TOKEN_PREFIX.length));
}

/**
 * Resolve a GitHub PAT by label. Returns the token string or null.
 */
function resolveToken(label) {
  if (!label) return null;
  return process.env[`${TOKEN_PREFIX}${label}`] || null;
}

/**
 * Build a JSON response.
 */
function jsonResponse(statusCode, data) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  };
}

/**
 * Validate the incoming request body for repo creation.
 * Returns an error message string or null if valid.
 */
function validateInput(body) {
  if (!body || typeof body !== "object") {
    return "Request body must be a JSON object";
  }

  if (!body.token || typeof body.token !== "string") {
    return '"token" is required — specify which token label to use (call GET /tokens to list available labels)';
  }

  if (!body.name || typeof body.name !== "string") {
    return '"name" is required and must be a string';
  }

  if (body.name.length > 100) {
    return '"name" must be 100 characters or fewer';
  }

  if (!REPO_NAME_PATTERN.test(body.name)) {
    return '"name" may only contain alphanumeric characters, hyphens, underscores, and dots';
  }

  if (body.description !== undefined && typeof body.description !== "string") {
    return '"description" must be a string';
  }

  if (body.description !== undefined && body.description.length > 350) {
    return '"description" must be 350 characters or fewer';
  }

  if (body.private !== undefined && typeof body.private !== "boolean") {
    return '"private" must be a boolean';
  }

  if (body.org !== undefined) {
    if (typeof body.org !== "string" || body.org.length === 0) {
      return '"org" must be a non-empty string';
    }
  }

  if (body.auto_init !== undefined && typeof body.auto_init !== "boolean") {
    return '"auto_init" must be a boolean';
  }

  if (body.default_branch !== undefined) {
    if (typeof body.default_branch !== "string" || body.default_branch.length === 0) {
      return '"default_branch" must be a non-empty string';
    }
  }

  if (body.gitignore_template !== undefined) {
    if (typeof body.gitignore_template !== "string" || body.gitignore_template.length === 0) {
      return '"gitignore_template" must be a non-empty string';
    }
  }

  return null;
}

/**
 * Lambda handler.
 *
 * Routes:
 *   GET  /tokens  — List available token labels
 *   POST /create  — Create a GitHub repository
 */
export async function handler(event) {
  const method = event.httpMethod || event.requestContext?.http?.method || "POST";
  const path = event.path || event.rawPath || "/";

  // GET /tokens — list available token labels
  if (method === "GET" && path.endsWith("/tokens")) {
    const labels = discoverTokenLabels();
    return jsonResponse(200, { tokens: labels });
  }

  // POST /create — create a repo
  if (method === "POST" && (path.endsWith("/create") || path === "/")) {
    return handleCreate(event);
  }

  return jsonResponse(404, { error: `Unknown route: ${method} ${path}` });
}

/**
 * Handle repo creation.
 */
async function handleCreate(event) {
  // Parse body.
  let body;
  try {
    body = typeof event.body === "string" ? JSON.parse(event.body) : event.body;
  } catch {
    return jsonResponse(400, { error: "Invalid JSON in request body" });
  }

  // Validate input.
  const validationError = validateInput(body);
  if (validationError) {
    return jsonResponse(400, { error: validationError });
  }

  // Resolve token by label.
  const token = resolveToken(body.token);
  if (!token) {
    const available = discoverTokenLabels();
    return jsonResponse(400, {
      error: `Token label "${body.token}" not found`,
      available_tokens: available,
    });
  }

  // Build GitHub API request.
  const { name, description, org, auto_init, default_branch, gitignore_template } = body;
  const isPrivate = body.private !== undefined ? body.private : true;

  const payload = { name, private: isPrivate };
  if (description !== undefined) payload.description = description;
  if (auto_init !== undefined) payload.auto_init = auto_init;
  if (gitignore_template !== undefined) payload.gitignore_template = gitignore_template;
  if (default_branch !== undefined) payload.default_branch = default_branch;

  const url = org
    ? `${GITHUB_API}/orgs/${encodeURIComponent(org)}/repos`
    : `${GITHUB_API}/user/repos`;

  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error("GitHub API request failed:", err.message);
    return jsonResponse(500, { error: "Failed to reach GitHub API" });
  }

  // Parse GitHub response.
  let data;
  try {
    data = await response.json();
  } catch {
    return jsonResponse(502, { error: "Invalid response from GitHub API" });
  }

  if (response.status === 201) {
    return jsonResponse(201, {
      full_name: data.full_name,
      html_url: data.html_url,
      clone_url: data.clone_url,
      ssh_url: data.ssh_url,
      private: data.private,
      default_branch: data.default_branch,
    });
  }

  // Map GitHub errors.
  if (response.status === 422) {
    const messages = Array.isArray(data.errors)
      ? data.errors.map((e) => e.message).filter(Boolean)
      : [];

    const isNameTaken = messages.some((m) => m.toLowerCase().includes("name already exists"));
    if (isNameTaken) {
      return jsonResponse(409, { error: `Repository "${name}" already exists` });
    }

    return jsonResponse(422, { error: data.message || "Validation failed" });
  }

  if (response.status === 401 || response.status === 403) {
    return jsonResponse(response.status, {
      error: "GitHub authentication failed — check your token and permissions",
    });
  }

  if (response.status === 404) {
    return jsonResponse(404, {
      error: org
        ? `Organization "${org}" not found or token lacks access`
        : "GitHub API endpoint not found",
    });
  }

  console.error("Unexpected GitHub status:", response.status);
  return jsonResponse(response.status >= 500 ? 502 : response.status, {
    error: data.message || "Unexpected error from GitHub",
  });
}
