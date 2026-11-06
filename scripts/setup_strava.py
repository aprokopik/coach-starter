#!/usr/bin/env python3
"""One-time Strava connection for the coach: prints the three GitHub secrets the Strava pull needs.

    python3 scripts/setup_strava.py <client_id> <client_secret>              # step 1: prints a link to open
    python3 scripts/setup_strava.py <client_id> <client_secret> <redirect>   # step 2: paste the page address you land on

Before step 1, make a Strava API application at https://www.strava.com/settings/api
(any name; Website and Authorization Callback Domain: localhost). Its page shows the Client ID
and Client Secret. Step 1 prints an address: open it, press Authorize, and copy the address of
the page you land on (it will not load, which is expected; it holds the code). Step 2 exchanges
that code for a refresh token and prints the three secrets to save in the repository
(Settings, Secrets and variables, Actions). Nothing is written to the repo.
"""
import json
import sys
import urllib.parse
import urllib.request


def main(argv):
    if len(argv) < 2:
        print(__doc__)
        return 1
    cid, secret = argv[0], argv[1]
    if len(argv) == 2:
        q = urllib.parse.urlencode({"client_id": cid, "response_type": "code", "redirect_uri": "http://localhost/exchange",
                                    "approval_prompt": "force", "scope": "read,activity:read_all"})
        print("Open this address, press Authorize, then copy the address of the page you land on:")
        print(f"https://www.strava.com/oauth/authorize?{q}")
        return 0
    code = urllib.parse.parse_qs(urllib.parse.urlparse(argv[2]).query).get("code", [argv[2]])[0]
    data = urllib.parse.urlencode({"client_id": cid, "client_secret": secret, "code": code, "grant_type": "authorization_code"}).encode()
    with urllib.request.urlopen(urllib.request.Request("https://www.strava.com/oauth/token", data=data, method="POST"), timeout=30) as r:
        tok = json.load(r)
    if "activity:read_all" not in (urllib.parse.parse_qs(urllib.parse.urlparse(argv[2]).query).get("scope", ["activity:read_all"])[0]):
        print("Warning: 'View data about your private activities' was not ticked; private workouts will be missed.")
    print("Save these three repository secrets:")
    print(f"  STRAVA_CLIENT_ID      {cid}")
    print(f"  STRAVA_CLIENT_SECRET  {secret}")
    print(f"  STRAVA_REFRESH_TOKEN  {tok['refresh_token']}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
