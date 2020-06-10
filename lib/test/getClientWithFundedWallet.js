const {
  PrivateKey,
} = require('@dashevo/dashcore-lib');

const Dash = require('dash');

const fundAddress = require('./fundAddress');

let client = undefined;

/**
 * Create and fund DashJS client
 *
 * @returns {Promise<Client>}
 */
async function getClientWithFundedWallet() {
  // client is already created and funded
  if (client) {
    return client;
  }

  const seeds = process.env.DAPI_SEED
    .split(',')
    .map((seed) => ({ service: `${seed}` }));

  // Prepare to fund wallet
  const faucetPrivateKey = PrivateKey.fromString(process.env.FAUCET_PRIVATE_KEY);
  const faucetAddress = faucetPrivateKey
    .toAddress(process.env.NETWORK)
    .toString();

  const dashClient = new Dash.Client({
    seeds,
    wallet: {
      transporter: {
        seeds,
        timeout: 15000,
        retries: 10,
        type: 'dapi',
      },
    },
    network: process.env.NETWORK,
  });

  await dashClient.isReady();

  const { address: fundAddress } = dashClient.account.getAddress();

  await fundAddress(
    dashClient.clients.dapi,
    faucetAddress,
    faucetPrivateKey,
    fundAddress,
    20000,
  );

  client = dashClient;

  return client;
}

module.exports = getClientWithFundedWallet;
