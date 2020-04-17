#!/usr/bin/env bash

set -ea

cmd_usage="Run test suite

Usage: run-test <seed> [options]

  <seed> can be IP or IP:port

  Options:
  -ni       --npm-install   - run npm install before running the suite
  -s=a,b,c  --scope=a,b,c   - run only scope
  -h        --help          - Show help

  Possible scopes:
  e2e
  functional
  core
  platform
  e2e:dpns
  e2e:contacts
  functional:core
  functional:platform"


DASHJS_SEED="$1"

if [ -z "$DASHJS_SEED" ] || [[ $DASHJS_SEED == -* ]]
then
  echo "Seed is not specified"
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
    npm_install=1
    ;;
    -s=*|--scope=*)
    scope="${i#*=}"
    ;;
esac
done

if [ -n "$npm_install" ]
then
  cd .. && npm install
fi

if [ -n "$scope" ]
then
  cd .. && DASHJS_SEED="$DASHJS_SEED" npm run test:"$scope"
else
  cd .. && DASHJS_SEED="$DASHJS_SEED" npm run test
fi
