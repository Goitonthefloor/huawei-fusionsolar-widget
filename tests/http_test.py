#!/usr/bin/env python3
import base64
import json
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "contents" / "code" / "fshttp.py"


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(length)
        if self.path != "/login":
            self.send_error(404)
            return
        payload = json.loads(body.decode("utf-8"))
        assert payload["username"] == "ada"
        self.send_response(302)
        self.send_header("Location", "/next")
        self.send_header("Set-Cookie", "dp-session=abc; Path=/; HttpOnly")
        self.send_header("Set-Cookie", "locale=en-us; Path=/")
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(b'{"ok":true}')

    def log_message(self, fmt, *args):
        return


def main():
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    port = server.server_address[1]
    request = {
        "method": "POST",
        "url": "http://127.0.0.1:%d/login" % port,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps({"username": "ada"}),
        "timeout": 5,
    }
    encoded = base64.b64encode(json.dumps(request).encode("utf-8")).decode("ascii")
    completed = subprocess.run(
        [sys.executable, str(SCRIPT), encoded, "ignored"],
        check=True,
        capture_output=True,
        text=True,
    )
    server.shutdown()
    result = json.loads(completed.stdout)
    assert result["status"] == 302, result
    assert result["location"] == "/next", result
    assert any(cookie.startswith("dp-session=abc") for cookie in result["setCookies"]), result
    assert result["headerMap"]["location"] == "/next"
    assert '"ok":true' in result["body"]
    print("http tests passed")


if __name__ == "__main__":
    main()
