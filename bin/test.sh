#!/usr/bin/env bash

set -ea

cmd_usage="Run test suite

Usage: run-test <seed> <faucet-private-key> [options]

  <seed> can be IP or IP:port

  Options:
  -ni=pkg   --npm-install=pkg   - install npm package before running the suite
  -s=a,b,c  --scope=a,b,c       - test scope tp run
  -h        --help              - show help

  Possible scopes:
  e2e
  functional
  core
  platform
  e2e:dpns
  e2e:contacts
  functional:core
  functional:platform"

DAPI_SEED="$1"
FAUCET_PRIVATE_KEY="$2"

if [ -z "$DAPI_SEED" ] || [[ $DAPI_SEED == -* ]]
then
  echo "Seed is not specified"
  exit 0
fi

if [ -z "$FAUCET_PRIVATE_KEY" ] || [[ $FAUCET_PRIVATE_KEY == -* ]]
then
  echo "Faucet private key is not specified"
  exit 0
fi

for i in "$@"
do
case ${i} in
    -h|--help)
        echo "$cmd_usage"
        exit 0
    ;;
    -ni|--npm-install)
    npm_package_to_install="${i#*=}"
    ;;
    -s=*|--scope=*)
    scope="${i#*=}"
    ;;
esac
done

if [ -n "$npm_package_to_install" ]
then
  cd .. && npm install "$npm_package_to_install"
fi

if [ -n "$scope" ]
then
  cd .. && DAPI_SEED="$DAPI_SEED" FAUCET_PRIVATE_KEY="$FAUCET_PRIVATE_KEY" npm run test:"$scope"
else
  cd .. && DAPI_SEED="$DAPI_SEED" FAUCET_PRIVATE_KEY="$FAUCET_PRIVATE_KEY" npm run test
fi
