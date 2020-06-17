#!/usr/bin/env bash

export PRIVATE_KEY=$(mn wallet:generate-to-address local 2000 | grep -m 1 "Private key:" | awk '{printf $3}')
export OPERATOR_BLS_KEY=$(mn register local $PRIVATE_KEY 127.0.0.1 20001 | grep -m 1 "Private key:" | awk '{printf $3}')
