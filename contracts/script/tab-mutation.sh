#!/usr/bin/env bash
set -euo pipefail
HERE=$(cd "$(dirname "$0")/.." && pwd)
TAB="$HERE/src/Tab.sol"
RPC="${MONAD_TESTNET_RPC_URL:-https://testnet-rpc.monad.xyz}"

python3 - "$TAB" <<'PY'
import sys
from pathlib import Path
p = Path(sys.argv[1])
text = p.read_text()
old = """        token.receiveWithAuthorization(member, address(this), amount, validAfter, validBefore, nonce, v, r, s);
        require(token.transfer(host, amount), "transfer");
        paid[member] = true;
        paidSum += amount;"""
new = """        paid[member] = true;
        paidSum += amount;"""
if old not in text:
    raise SystemExit("auth block missing")
p.write_text(text.replace(old, new, 1))
PY

echo "=== mutation: payment pull removed (expect FAIL) ==="
if forge test --match-path test/Tab.t.sol --fork-url "$RPC" --match-test test_cannot_settle_wrong_member -q 2>/dev/null; then
  echo "MUTATION FAILED: cross-member settle stayed green"
  python3 - "$TAB" <<'PY'
import sys
from pathlib import Path
p = Path(sys.argv[1])
text = p.read_text()
broken = """        paid[member] = true;
        paidSum += amount;"""
fixed = """        token.receiveWithAuthorization(member, address(this), amount, validAfter, validBefore, nonce, v, r, s);
        require(token.transfer(host, amount), "transfer");
        paid[member] = true;
        paidSum += amount;"""
p.write_text(text.replace(broken, fixed, 1))
PY
  exit 1
fi
echo "mutation red: ok"

python3 - "$TAB" <<'PY'
import sys
from pathlib import Path
p = Path(sys.argv[1])
text = p.read_text()
broken = """        paid[member] = true;
        paidSum += amount;"""
fixed = """        token.receiveWithAuthorization(member, address(this), amount, validAfter, validBefore, nonce, v, r, s);
        require(token.transfer(host, amount), "transfer");
        paid[member] = true;
        paidSum += amount;"""
p.write_text(text.replace(broken, fixed, 1))
PY

echo "=== restored auth (expect PASS) ==="
forge test --match-path test/Tab.t.sol --fork-url "$RPC" --match-test test_cannot_settle_wrong_member -q
echo "mutation green: ok"
