#!/bin/sh
# End-to-end smoke test for the DevColorz API.
#
# Runs against a live server and walks the whole first-run path: install,
# sign in, create and read a palette, publish it, exercise the admin surface,
# and confirm that the security guards actually refuse what they should.
#
# Usage: BASE=http://127.0.0.1:8080 sh scripts/smoke-api.sh

set -eu

BASE="${BASE:-http://127.0.0.1:8080}"
JAR="$(mktemp)"
PASS=0
FAIL=0

say() { printf '%s\n' "$*"; }

# check <name> <expected-status> <actual-status> [detail]
check() {
  if [ "$2" = "$3" ]; then
    PASS=$((PASS + 1))
    printf '  ok   %-46s %s\n' "$1" "$3"
  else
    FAIL=$((FAIL + 1))
    printf '  FAIL %-46s expected %s, got %s %s\n' "$1" "$2" "$3" "${4:-}"
  fi
}

# req <method> <path> [body] -> writes body to $BODY_FILE, echoes status
BODY_FILE="$(mktemp)"
req() {
  method="$1"
  path="$2"
  body="${3:-}"
  if [ -n "$body" ]; then
    curl -sS -o "$BODY_FILE" -w '%{http_code}' \
      -X "$method" "$BASE$path" \
      -b "$JAR" -c "$JAR" \
      -H 'Content-Type: application/json' \
      -H "X-CSRF-Token: ${CSRF:-}" \
      -H "Origin: $BASE" \
      --data "$body"
  else
    curl -sS -o "$BODY_FILE" -w '%{http_code}' \
      -X "$method" "$BASE$path" \
      -b "$JAR" -c "$JAR" \
      -H 'Accept: application/json' \
      -H "X-CSRF-Token: ${CSRF:-}" \
      -H "Origin: $BASE"
  fi
}

json() { sed -n "s/.*\"$1\":\"\{0,1\}\([^,\"}]*\).*/\1/p" "$BODY_FILE" | head -1; }

say "DevColorz API smoke test against $BASE"
say ""

say "meta"
status=$(req GET /api/meta)
check "GET /api/meta" 200 "$status"
INSTALLED=$(json installed)
say "  installed=$INSTALLED"

if [ "$INSTALLED" = "false" ]; then
  say ""
  say "install"
  status=$(req GET /api/setup/status)
  check "GET /api/setup/status" 200 "$status"

  CODE_FILE="${STORAGE:-server/storage}/setup-code.txt"
  if [ ! -f "$CODE_FILE" ]; then
    say "  FAIL challenge file not written at $CODE_FILE"
    FAIL=$((FAIL + 1))
  else
    CODE=$(tr -d '\r\n' < "$CODE_FILE")
    say "  challenge code read from disk"

    status=$(req POST /api/setup/install "{\"challengeCode\":\"WRONG-CODE-00\",\"email\":\"a@example.com\",\"password\":\"correct horse battery\",\"displayName\":\"A\",\"siteName\":\"T\"}")
    check "install rejects a wrong challenge code" 422 "$status"

    status=$(req POST /api/setup/install "{\"challengeCode\":\"$CODE\",\"email\":\"admin@example.com\",\"password\":\"correct horse battery staple\",\"displayName\":\"Admin\",\"siteName\":\"DevColorz Test\"}")
    check "POST /api/setup/install" 200 "$status"
    CSRF=$(json csrf)

    status=$(req POST /api/setup/install "{\"challengeCode\":\"$CODE\",\"email\":\"b@example.com\",\"password\":\"correct horse battery staple\",\"displayName\":\"B\",\"siteName\":\"X\"}")
    check "install refuses to run twice" 410 "$status"
  fi
fi

say ""
say "session"
status=$(req GET /api/csrf)
check "GET /api/csrf" 200 "$status"
CSRF=$(json token)

status=$(req GET /api/auth/me)
say "  auth/me -> $status"

if [ "$status" != "200" ]; then
  status=$(req POST /api/auth/login '{"email":"admin@example.com","password":"correct horse battery staple"}')
  check "POST /api/auth/login" 200 "$status"
  CSRF=$(json csrf)
fi

status=$(req GET /api/auth/me)
check "GET /api/auth/me after sign-in" 200 "$status"
ROLE=$(json role)
check "the first account is an administrator" "admin" "$ROLE"

say ""
say "guards"
status=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$BASE/api/palettes" \
  -b "$JAR" -H 'Content-Type: application/json' -H 'X-CSRF-Token: obviously-wrong' \
  -H "Origin: $BASE" --data '{"title":"x","doc":{"colors":["#ff0000"]}}')
check "a bad CSRF token is refused" 419 "$status"

status=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$BASE/api/palettes" \
  -b "$JAR" -H 'Content-Type: application/json' -H "X-CSRF-Token: $CSRF" \
  -H 'Origin: https://evil.example' --data '{"title":"x","doc":{"colors":["#ff0000"]}}')
check "a foreign Origin is refused" 403 "$status"

status=$(curl -sS -o /dev/null -w '%{http_code}' "$BASE/storage/")
check "storage/ is not served" 403 "$status"

status=$(curl -sS -o /dev/null -w '%{http_code}' "$BASE/config.php")
check "config.php is not served" 403 "$status"

status=$(curl -sS -o /dev/null -w '%{http_code}' "$BASE/cron.php")
check "cron.php without a key 404s" 404 "$status"

status=$(curl -sS -o /dev/null -w '%{http_code}' "$BASE/cron.php?k=definitely-not-the-token")
check "cron.php with a wrong key 404s" 404 "$status"

say ""
say "palettes"
status=$(req POST /api/palettes '{"title":"Smoke test","doc":{"colors":["#264653","#2a9d8f","#e9c46a","#f4a261","#e76f51"]},"visibility":"private"}')
check "POST /api/palettes" 201 "$status"
UUID=$(json uuid)
SLUG=$(json slug)

status=$(req GET "/api/palettes/$UUID")
check "GET /api/palettes/{uuid}" 200 "$status"

status=$(req GET /api/palettes)
check "GET /api/palettes" 200 "$status"

status=$(req PATCH "/api/palettes/$UUID" '{"title":"Smoke test renamed","visibility":"public"}')
check "PATCH /api/palettes/{uuid}" 200 "$status"

status=$(req GET "/api/explore/$SLUG")
check "GET /api/explore/{slug}" 200 "$status"

status=$(req POST "/api/palettes/$UUID/like")
check "POST /api/palettes/{uuid}/like" 200 "$status"

status=$(req GET /api/explore)
check "GET /api/explore" 200 "$status"

status=$(req GET "/api/palettes/$UUID/versions")
check "GET /api/palettes/{uuid}/versions" 200 "$status"

say ""
say "admin"
for path in /api/admin/stats /api/admin/settings /api/admin/users /api/admin/palettes /api/admin/outbox /api/admin/audit /api/admin/selftest; do
  status=$(req GET "$path")
  check "GET $path" 200 "$status"
done

status=$(req PATCH /api/admin/settings '{"site.name":"DevColorz Smoke"}')
check "PATCH /api/admin/settings" 200 "$status"

status=$(req POST /api/admin/maintenance '{"action":"integrity"}')
check "POST /api/admin/maintenance integrity" 200 "$status"

status=$(req POST /api/admin/maintenance '{"action":"checkpoint"}')
check "POST /api/admin/maintenance checkpoint" 200 "$status"

status=$(req POST /api/admin/cron/run '{"job":"prune"}')
check "POST /api/admin/cron/run" 200 "$status"

say ""
say "auth edge cases"
status=$(req POST /api/auth/login '{"email":"admin@example.com","password":"wrong"}')
check "a wrong password is refused" 401 "$status"

status=$(req POST /api/auth/login '{"email":"nobody@example.com","password":"wrong"}')
check "an unknown address gets the same 401" 401 "$status"

status=$(req POST /api/auth/forgot '{"email":"nobody@example.com"}')
check "forgot-password never reveals the account" 204 "$status"

status=$(req POST /api/auth/register '{"email":"new@example.com","password":"correct horse battery staple","displayName":"New","inviteToken":"NOPE"}')
check "registration without a valid invite is refused" 422 "$status"

say ""
status=$(req DELETE "/api/palettes/$UUID")
check "DELETE /api/palettes/{uuid}" 204 "$status"

say ""
say "$PASS passed, $FAIL failed"
rm -f "$JAR" "$BODY_FILE"
[ "$FAIL" -eq 0 ]
