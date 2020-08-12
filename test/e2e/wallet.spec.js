const {
  Mnemonic,
} = require('@dashevo/dashcore-lib');

const Dash = require('dash');

const getDAPISeeds = require('../../lib/test/getDAPISeeds');

const createClientWithFundedWallet = require('../../lib/test/createClientWithFundedWallet');

describe('e2e', () => {
  describe('Wallet', function main() {
    this.timeout(950000);

    let fundedWallet;
    let emptyWallet;
    let duplicateWallet;
    let mnemonic;

    before(async () => {
      mnemonic = new Mnemonic();
      fundedWallet = await createClientWithFundedWallet();
      emptyWallet = new Dash.Client({
        wallet: {
          mnemonic,
        },
      });
    });

    after(async () => {
      if (fundedWallet) {
        await fundedWallet.disconnect();
      }

      if (emptyWallet) {
        await emptyWallet.disconnect();
      }

      if (duplicateWallet) {
        await duplicateWallet.disconnect();
      }
    });

    describe('empty wallet', () => {
      it('should have no transaction at first', async () => {
        const emptyAccount = await emptyWallet.getAccount();

        expect(emptyAccount.getTransactions()).to.be.empty();
      });

      it('should receive a transaction when as it has been sent', async () => {
        const emptyAccount = await emptyWallet.getAccount();
        const fundedAccount = await fundedWallet.getAccount();

        const tx = await fundedAccount.createTransaction({
          recipient: {
            amount: 10,
            address: emptyAccount.getUnusedAddress(),
          },
        });

        await fundedAccount.broadcastTransaction(tx);

        expect(emptyAccount.getTransactions()).to.have.lengthOf(1);

        // TODO: check tx is exactly the same as the sent one
      });
    });

    describe('duplicate wallet', () => {
      it('should have all transaction from before at first', async () => {
        duplicateWallet = new Dash.Client({
          wallet: {
            mnemonic,
          },
          seeds: getDAPISeeds(),
        });

        const duplicateAccount = await duplicateWallet.getAccount();

        expect(duplicateAccount.getTransactions()).to.have.lengthOf(1);

        // TODO: check tx is exactly the same as the sent one
      });

      it('should receive a transaction when as it has been sent', async () => {
        const duplicateAccount = await duplicateWallet.getAccount();
        const fundedAccount = await fundedWallet.getAccount();

        const tx = await fundedAccount.createTransaction({
          recipient: {
            amount: 10,
            address: duplicateAccount.getUnusedAddress(),
          },
        });

        await fundedAccount.broadcastTransaction(tx);

        expect(duplicateAccount.getTransactions()).to.have.lengthOf(1);

        // TODO: check tx is exactly the same as the sent one
      });
    });

    describe('empty wallet', () => {
      it('should receive a transaction when as it has been sent to duplicate wallet', async () => {
        const emptyAccount = await emptyWallet.getAccount();

        expect(emptyAccount.getTransactions()).to.have.lengthOf(2);

        // TODO: check txs are exactly the same as the sent ones
      });
    });
  });
});
