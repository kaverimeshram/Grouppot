#!/usr/bin/env bash
# grouppot contracts against real AUSD on a Monad testnet fork, then four mutants that must each go red.
# No key, no broadcast. Usage: contracts/script/test.sh [fuzz-runs]
set -uo pipefail
[ -d "$(dirname "$0")/../lib/forge-std" ] || { mkdir -p "$(dirname "$0")/../lib" && git clone -q --depth 1 --branch v1.10.0 https://github.com/foundry-rs/forge-std "$(dirname "$0")/../lib/forge-std" && rm -rf "$(dirname "$0")/../lib/forge-std/.git"; }
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
mutant no-guarantee 's/uint256 fromGuarantee = bond < gap \? bond : gap;/uint256 fromGuarantee = 0;/'
mutant no-repay-from-pot 's/amount -= _settle\(to, amount\);//'
mutant no-victim-debt 's/if \(gap > 0\) debts\[m\]\.push\(Debt\(to, gap\)\);//'
mutant no-gas-guard 's/require\(gasleft\(\) > PULL_GAS \+ PULL_GAS \/ 63 \+ 50_000, "Circle:gas"\);//'
mutant no-leave-sig 's/require\(_recover\(leaveDigest\(member\), sig\) == member, "Circle:sig"\);//'
mutant no-record-gate 's/require\(r\.paid >= minPaid && r\.missed == 0, "Circle:record"\);//'
mutant record-at-join 's/(paidCount\[0\]\+\+;\n        cash\[member\] = contribution;)/$1 record.notePaid(member);/'
mutant no-schedule-check 's/require\(_recover\(keccak256[^;]*schedule-sig"\);//'
} | tee results-mutants.txt
