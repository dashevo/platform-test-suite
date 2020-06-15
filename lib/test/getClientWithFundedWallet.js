const {
  PrivateKey,
} = require('@dashevo/dashcore-lib');

const Dash = require('dash');

const fundAddress = require('./fundAddress');
const wait = require('../wait');

let client;

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

  client = new Dash.Client({
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

  const account = await client.getWalletAccount();

  const { address: addressToFund } = account.getAddress();

  const amount = 40000;

  await fundAddress(
    client.getDAPIClient(),
    faucetAddress,
    faucetPrivateKey,
    addressToFund,
    amount,
  );

  do {
    await wait(500);
  } while (account.getTotalBalance() < amount);

  return client;
}

module.exports = getClientWithFundedWallet;
