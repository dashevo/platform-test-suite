const Xazab = require('xazab');

const fundWallet = require('@xazab/wallet-lib/src/utils/fundWallet');

const getDAPISeeds = require('./getDAPISeeds');

const createFaucetClient = require('./createFaucetClient');

/**
 * Create and fund XazabJS client
 * @param {string} [HDPrivateKey]
 *
 * @returns {Promise<Client>}
 */
async function createClientWithFundedWallet(HDPrivateKey = undefined) {
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

  const faucetClient = createFaucetClient();

  const walletOptions = {};

  if (HDPrivateKey) {
    walletOptions.HDPrivateKey = HDPrivateKey;
  }

  const client = new Xazab.Client({
    ...clientOpts,
    wallet: walletOptions,
    passFakeAssetLockProofForTests: process.env.NETWORK === 'regtest',
  });

  const amount = 40000;

  await fundWallet(faucetClient.wallet, client.wallet, amount);

  return client;
}

module.exports = createClientWithFundedWallet;
