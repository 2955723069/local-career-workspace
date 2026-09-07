#!/bin/sh
set -eu

# Some managed Linux runners provide Playwright's browser but omit its shared
# libraries. Use the runner-local extraction when available; otherwise keep
# the standard Playwright environment unchanged.
PLAYWRIGHT_LOCAL_LIBS="/tmp/c3-libs/usr/lib/x86_64-linux-gnu"
if [ -d "$PLAYWRIGHT_LOCAL_LIBS" ]; then
  if [ -n "${LD_LIBRARY_PATH:-}" ]; then
    export LD_LIBRARY_PATH="$PLAYWRIGHT_LOCAL_LIBS:$LD_LIBRARY_PATH"
  else
    export LD_LIBRARY_PATH="$PLAYWRIGHT_LOCAL_LIBS"
  fi
fi

exec playwright test "$@"
