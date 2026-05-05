# Copyright 2026 Neo4j Labs
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

"""OAuth2 local redirect flow for CLI applications.

Provides a reusable OAuth2 authorization code flow that:
1. Starts a temporary HTTP server on localhost
2. Opens the browser to the consent URL
3. Receives the auth code callback
4. Exchanges the code for tokens
"""

from __future__ import annotations

import json
import shutil
import subprocess
import urllib.parse
import webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Any


def check_gws_cli() -> bool:
    """Check if the Google Workspace CLI (gws) is available."""
    return shutil.which("gws") is not None


def install_gws_cli() -> bool:
    """Attempt to install the Google Workspace CLI via npm."""
    if not shutil.which("npm"):
        return False
    try:
        subprocess.run(
            ["npm", "install", "-g", "@googleworkspace/cli"],
            check=True,
            capture_output=True,
            timeout=120,
        )
        return True
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, FileNotFoundError):
        return False


def run_gws_command(args: list[str]) -> dict[str, Any]:
    """Run a gws CLI command and return parsed JSON output."""
    try:
        result = subprocess.run(
            ["gws"] + args + ["--format", "json"],
            capture_output=True,
            text=True,
            timeout=60,
        )
        if result.returncode != 0:
            raise RuntimeError(f"gws command failed: {result.stderr}")
        return json.loads(result.stdout)
    except json.JSONDecodeError:
        raise RuntimeError(f"Failed to parse gws output: {result.stdout[:200]}")
    except subprocess.TimeoutExpired:
        raise RuntimeError("gws command timed out")


class _OAuthCallbackHandler(BaseHTTPRequestHandler):
    """HTTP handler that captures the OAuth2 callback."""

    auth_code: str | None = None
    error: str | None = None

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed.query)

        if "code" in params:
            _OAuthCallbackHandler.auth_code = params["code"][0]
            self.send_response(200)
            self.send_header("Content-Type", "text/html")
            self.end_headers()
            self.wfile.write(
                b"<html><body><h1>Authorization successful!</h1>"
                b"<p>You can close this window and return to the terminal.</p></body></html>"
            )
        elif "error" in params:
            _OAuthCallbackHandler.error = params.get("error_description", params["error"])[0]
            self.send_response(400)
            self.send_header("Content-Type", "text/html")
            self.end_headers()
            self.wfile.write(b"<html><body><h1>Authorization failed</h1></body></html>")
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):
        pass  # Suppress HTTP logs


def oauth2_authorize(
    auth_url: str,
    token_url: str,
    client_id: str,
    client_secret: str,
    scopes: list[str],
    redirect_port: int = 0,
    timeout: int = 120,
) -> dict[str, str]:
    """Run OAuth2 authorization code flow with local redirect server.

    Args:
        auth_url: OAuth2 authorization endpoint
        token_url: OAuth2 token exchange endpoint
        client_id: OAuth2 client ID
        client_secret: OAuth2 client secret
        scopes: List of OAuth2 scopes
        redirect_port: Local port for redirect (0 = random available)
        timeout: Timeout in seconds waiting for authorization

    Returns:
        Dict with access_token and optionally refresh_token
    """
    import urllib.request

    # Reset handler state
    _OAuthCallbackHandler.auth_code = None
    _OAuthCallbackHandler.error = None

    # Start local server
    server = HTTPServer(("127.0.0.1", redirect_port), _OAuthCallbackHandler)
    port = server.server_address[1]
    redirect_uri = f"http://localhost:{port}/callback"

    # Build authorization URL
    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": " ".join(scopes),
        "access_type": "offline",
    }
    full_auth_url = f"{auth_url}?{urllib.parse.urlencode(params)}"

    # Open browser
    webbrowser.open(full_auth_url)

    # Wait for callback
    server.timeout = timeout
    while _OAuthCallbackHandler.auth_code is None and _OAuthCallbackHandler.error is None:
        server.handle_request()

    server.server_close()

    if _OAuthCallbackHandler.error:
        raise RuntimeError(f"OAuth2 authorization failed: {_OAuthCallbackHandler.error}")

    if not _OAuthCallbackHandler.auth_code:
        raise RuntimeError("OAuth2 authorization timed out")

    # Exchange code for tokens
    token_data = urllib.parse.urlencode({
        "grant_type": "authorization_code",
        "code": _OAuthCallbackHandler.auth_code,
        "redirect_uri": redirect_uri,
        "client_id": client_id,
        "client_secret": client_secret,
    }).encode()

    req = urllib.request.Request(
        token_url,
        data=token_data,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    with urllib.request.urlopen(req) as resp:
        tokens = json.loads(resp.read())

    return {
        "access_token": tokens.get("access_token", ""),
        "refresh_token": tokens.get("refresh_token", ""),
    }
