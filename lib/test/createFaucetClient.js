const Xazab = require('xazab');

const getDAPISeeds = require('./getDAPISeeds');

let faucetClient;

function createFaucetClient() {
  if (faucetClient) {
    return faucetClient;
  }

  const seeds = getDAPISeeds();

  const clientOpts = {
    seeds,
    network: process.env.NETWORK,
    apps: {
      dpns: {
        contractId: process.env.DPNS_CONTRACT_ID,
      },
    },
  };

  faucetClient = new Xazab.Client({
    ...clientOpts,
    wallet: {
      privateKey: process.env.FAUCET_PRIVATE_KEY,
    },
    passFakeAssetLockProofForTests: process.env.NETWORK === 'regtest',
  });

  return faucetClient;
}

module.exports = createFaucetClient;
