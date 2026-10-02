#!/usr/bin/env bash
# grouppot contracts against real AUSD on a Monad testnet fork, then four mutants that must each go red.
# No key, no broadcast. Usage: contracts/script/test.sh [fuzz-runs]
set -uo pipefail
export FOUNDRY_DISABLE_NIGHTLY_WARNING=1
cd "$(dirname "$0")/.."
RUNS=${1:-256}
F=(--fork-url "${TRPC:-https://testnet-rpc.monad.xyz}" --fork-block-number "${TBLOCK:-67505000}" --fork-retries 12 --fork-retry-backoff 2000 --fuzz-runs "$RUNS")
FILT='^\[|^Suite|^  gas|Ran '

echo "== green"
timeout 900 forge test "${F[@]}" -vv | grep -E "$FILT" | cut -c1-200 | tee results-green.txt

mutant() { # name, perl substitution
  local M; M=$(mktemp -d); cp -R src test lib foundry.toml "$M/"
  perl -0pi -e "$2" "$M/src/Circle.sol"
  if cmp -s src/Circle.sol "$M/src/Circle.sol"; then echo "== mutant $1: SUBSTITUTION DID NOT APPLY"; return; fi
  echo "== mutant $1"
  (cd "$M" && timeout 900 forge test "${F[@]}" 2>&1 | grep -E "^\[FAIL|Ran |Suite result" | cut -c1-200)
  rm -rf "$M"
}
{
mutant no-debt  's/if \(gap > 0 && m != to\) debts\[m\]\.push\(Debt\(to, gap\)\);//'
mutant no-cap   's/uint256 amount = pot > cap \? cap : pot;/uint256 amount = pot;/'
mutant no-gas-guard 's/require\(gasleft\(\) > PULL_GAS \+ PULL_GAS \/ 63 \+ 50_000, "Circle:gas"\);//'
mutant no-schedule-check 's/require\(_recover\(keccak256[^;]*schedule-sig"\);//'
} | tee results-mutants.txt
