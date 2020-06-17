#!/usr/bin/env bash

mn wallet:generate-to-address local 2000
docker ps -a
docker ps -a -q | xargs -L 1 docker logs
export PRIVATE_KEY=$(mn wallet:generate-to-address local 2000 | grep -m 1 "Private key:" | awk '{printf $3}')
export OPERATOR_BLS_KEY=$(mn register local $PRIVATE_KEY 127.0.0.1 20001 | grep -m 1 "Private key:" | awk '{printf $3}')

echo "##############################"
echo  env
echo "##############################"
echo  PRIVATE_KEY ${PRIVATE_KEY}
echo  OPERATOR_BLS_KEY $OPERATOR_BLS_KEY
