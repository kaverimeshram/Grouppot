#!/usr/bin/env bash
set -euo pipefail
HERE=$(cd "$(dirname "$0")/.." && pwd)
cd "$HERE"
if [ ! -d lib/forge-std ]; then
  forge install foundry-rs/forge-std
fi
RPC="${MONAD_TESTNET_RPC_URL:-https://testnet-rpc.monad.xyz}"
forge test --match-path test/Tab.t.sol --fork-url "$RPC" -vv
