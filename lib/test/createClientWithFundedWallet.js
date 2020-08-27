const Dash = require('dash');

const getDAPISeeds = require('./getDAPISeeds');
const fundWallet = require('@dashevo/wallet-lib/src/utils/fundWallet')

/**
 * Create and fund DashJS client
 * @param {string} [HDPrivateKey]
 *
 * @returns {Promise<Client>}
 */
async function createClientWithFundedWallet(HDPrivateKey = undefined) {
  const seeds = getDAPISeeds();

  // Prepare to fund wallet
  const faucetPrivateKey = process.env.FAUCET_PRIVATE_KEY;

  const clientOpts = {
    seeds,
    network: process.env.NETWORK,
    apps: {
      dpns: {
        contractId: process.env.DPNS_CONTRACT_ID,
      },
    },
  }

  const walletOptions = {};

  if (HDPrivateKey) {
    walletOptions.HDPrivateKey = HDPrivateKey;
  }

  const faucetClient = new Dash.Client({
    ...clientOpts,
    wallet: {
      privateKey: faucetPrivateKey
    },
  });
  const { wallet: faucetWallet } = faucetClient.wallet;

  const newlyCreatedClient = new Dash.Client({
    ...clientOpts,
    wallet: walletOptions,
  });
  const walletToFund = newlyCreatedClient.wallet;


  const amount = 40000;

  await fundWallet(faucetWallet, walletToFund, amount);
}

module.exports = createClientWithFundedWallet;
