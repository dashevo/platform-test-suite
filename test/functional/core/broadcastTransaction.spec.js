const Dash = require('dash');

const createClientWithoutWallet = require('../../../lib/test/createClientWithoutWallet');
const fundAccount = require('../../../lib/test/fundAccount');

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

      const faucetWallet = new Dash.Client({
        ...clientOpts,
        wallet: {
          privateKey: faucetPrivateKey
        },
      });
      const faucetAccount = await faucetWallet.getWalletAccount();

      const walletToFund = new Dash.Client({
        ...clientOpts,
        wallet: {
          privateKey: null,
        },
      });

      const accountToFund = await walletToFund.getWalletAccount();

      const { transactionId: result} = await fundAccount(faucetAccount, accountToFund, amount);

      expect(result).to.be.a('string');
    });
  });
});
