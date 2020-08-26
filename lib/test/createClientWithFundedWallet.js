const Dash = require('dash');

const getDAPISeeds = require('./getDAPISeeds');
const fundAccount = require('./fundAccount');
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

  return new Promise(async (resolve, reject)=> {
    const faucetWallet = new Dash.Client({
      ...clientOpts,
      wallet: {
        privateKey: faucetPrivateKey
      },
    });

    const newlyCreatedClient = new Dash.Client({
      ...clientOpts,
      wallet: walletOptions,
    });

    const faucetAccount = await faucetWallet.getWalletAccount();

    const accountToFund = await newlyCreatedClient.getWalletAccount();

    const amount = 40000;

    await fundAccount(faucetAccount, accountToFund, amount);
  });
}

module.exports = createClientWithFundedWallet;
