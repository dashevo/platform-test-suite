const Xazab = require('xazab');

const getDAPISeeds = require('./getDAPISeeds');

function createClientWithoutWallet() {
  return new Xazab.Client({
    seeds: getDAPISeeds(),
    passFakeAssetLockProofForTests: process.env.NETWORK === 'regtest',
  });
}

module.exports = createClientWithoutWallet;
