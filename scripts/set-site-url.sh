#!/usr/bin/env bash
# Switch the public site URL used in canonical/og tags, JSON-LD, sitemap.xml,
# robots.txt and window.MS_SITE_URL (assets/js/config.js).
# Usage (from repo root):
#   scripts/set-site-url.sh https://marketscope.space/                       # back to the custom domain
#   scripts/set-site-url.sh https://ofirfr246-lab.github.io/marketscope/     # GitHub Pages project URL
# The current value is read from assets/js/config.js. Always end the URL with "/".
# Navigation itself uses relative paths and works on either URL without changes.
# When going back to the domain, also: re-add the CNAME file (one line: marketscope.space),
# set SITE_URL secret for create-checkout/create-portal, Stripe payment-link redirects,
# Stripe portal return URL, and Supabase Auth Site URL / redirect URLs.
set -euo pipefail
NEW="${1:?usage: $0 https://new.site/url/}"
case "$NEW" in */) ;; *) NEW="$NEW/";; esac
OLD="$(sed -n 's/^window\.MS_SITE_URL = "\([^"]*\)".*/\1/p' assets/js/config.js)"
[ -n "$OLD" ] || { echo "MS_SITE_URL not found in assets/js/config.js" >&2; exit 1; }
[ "$OLD" != "$NEW" ] || { echo "Already $NEW"; exit 0; }
files=$(grep -rlF --include='*.html' --include='sitemap.xml' --include='robots.txt' --include='config.js' "$OLD" . --exclude-dir=.git --exclude-dir=supabase || true)
for f in $files; do
  python3 - "$f" "$OLD" "$NEW" <<'PY'
import sys
p, old, new = sys.argv[1:]
s = open(p, encoding="utf-8").read()
open(p, "w", encoding="utf-8").write(s.replace(old, new))
PY
  echo "updated $f"
done
