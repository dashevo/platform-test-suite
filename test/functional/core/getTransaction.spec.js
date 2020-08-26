const Dash = require('dash');

const {
  Transaction,
  PrivateKey,
} = require('@dashevo/dashcore-lib');

const createClientWithoutWallet = require('../../../lib/test/createClientWithoutWallet');

const fundAddress = require('../../../lib/test/fundAddress');
const fundAccount = require('../../../lib/test/fundAccount');

describe('Core', () => {
  describe('getTransaction', () => {
    let client;

    before(() => {
      client = createClientWithoutWallet();
    });

    after(async () => {
      if (client) {
        await client.disconnect();
      }
    });

    it('should respond with a transaction by it\'s ID', async () => {
      const faucetPrivateKey = process.env.FAUCET_PRIVATE_KEY;

      const amount = 20000;

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

      const { transaction, transactionId } = await fundAccount(faucetAccount, accountToFund, amount);

      const result = await client.getDAPIClient().core.getTransaction(transactionId);
      const receivedTx = new Transaction(Buffer.from(result));

      expect(receivedTx.hash).to.deep.equal(transactionId);
    });

    it('should respond with null if transaction was not found', async () => {
      const nonExistentId = Buffer.alloc(32).toString('hex');

      const result = await client.getDAPIClient().core.getTransaction(nonExistentId);

      expect(result).to.equal(null);
    });
  });
});
