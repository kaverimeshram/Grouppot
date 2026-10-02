#!/usr/bin/env bash
# Exits 1 unless the live relayer (through the production site) reports gas and practice dollars above the floors.
# GAS_FLOOR / USD_FLOOR override the defaults (2 MON, $200), which is how this check is shown to fail.
set -uo pipefail
H=$(curl -sf -m 20 https://grouppot.vercel.app/api/health) || { echo "health unreachable"; exit 1; }
/usr/bin/python3 - "$H" "${GAS_FLOOR:-2}" "${USD_FLOOR:-200}" <<'PY'
import json, sys
h, gas, usd = json.loads(sys.argv[1]), float(sys.argv[2]), float(sys.argv[3])
ok = h["gasReserveMon"] >= gas and h["practiceDollars"] >= usd
print(f'gas {h["gasReserveMon"]:.2f} MON (floor {gas}), practice ${h["practiceDollars"]:.0f} (floor {usd}) -> {"OK" if ok else "LOW"}')
sys.exit(0 if ok else 1)
PY
