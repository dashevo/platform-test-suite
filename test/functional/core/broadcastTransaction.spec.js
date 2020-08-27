const Dash = require('dash');

const fundWallet = require('@dashevo/wallet-lib/src/utils/fundWallet')
const createClientWithoutWallet = require('../../../lib/test/createClientWithoutWallet');

describe('Core', () => {
  describe('broadcastTransaction', () => {
    let client;

    before(() => {
      client = createClientWithoutWallet();
    });

    after(async () => {
      if (client) {
        await client.disconnect();
      }
    });

    it('should sent transaction and return transaction ID', async () => {
      const faucetPrivateKey = process.env.FAUCET_PRIVATE_KEY;

      const amount = 10000;

      const clientOpts = {
        network: process.env.NETWORK,
      }

      const faucetClient = new Dash.Client({
        ...clientOpts,
        wallet: {
          privateKey: faucetPrivateKey
        },
      });

      const { wallet: faucetWallet } = faucetClient;

      const clientToFund = new Dash.Client({
        ...clientOpts,
        wallet: {
          privateKey: null,
        },
      });

      const { wallet: walletToFund } = clientToFund.wallet;

      const [ transactionId ] = await fundWallet(faucetWallet, walletToFund, amount);

      expect(transactionId).to.be.a('string');
    });
  });
});
