const Dash = require('dash');

const createClientWithoutWallet = require('../../../lib/test/createClientWithoutWallet');

const fundWallet = require('@dashevo/wallet-lib/src/utils/fundWallet')

describe('Core', () => {
  describe('getAddressSummary', () => {
    let address;
    let client;

    before(() => {
      client = createClientWithoutWallet();
    });

    after(async () => {
      if (client) {
        await client.disconnect();
      }
    });

    before(async () => {
      const faucetPrivateKey = process.env.FAUCET_PRIVATE_KEY;

      const clientOpts = {
        network: process.env.NETWORK,
      }

      const faucetClient = new Dash.Client({
        ...clientOpts,
        wallet: {
          privateKey: faucetPrivateKey
        },
      });

      const { wallet: faucetWallet } = faucetClient.wallet;

      const clientToFund = new Dash.Client({
        ...clientOpts,
        wallet: {
          privateKey: null,
        },
      });
      const { wallet: walletToFund } = clientToFund.wallet;

      const amount = 20000;

      await fundWallet(faucetWallet, walletToFund, amount)
    });

    it('should return address summary', async () => {
      const result = await client.getDAPIClient().core.getAddressSummary(address);

      expect(result).to.be.an('object');
      expect(result.addrStr).to.equal(address);
    });

    it('should throw an error on invalid params', async () => {
      address = 'Xh7nD4vTUYAxy8GV7t1k8Er9ZKmxRBDcL';

      try {
        await client.getDAPIClient().core.getAddressSummary(address);

        expect.fail('should throw an error');
      } catch (e) {
        expect(e.name).to.equal('JsonRpcError');
        expect(e.message).contains('Invalid address');
      }
    });
  });
});
