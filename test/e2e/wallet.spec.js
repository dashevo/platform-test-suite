const {
  Mnemonic,
} = require('@dashevo/dashcore-lib');

const Dash = require('dash');

const getDAPISeeds = require('../../lib/test/getDAPISeeds');

const createClientWithFundedWallet = require('../../lib/test/createClientWithFundedWallet');
const waitForBalanceToChange = require('../../lib/test/waitForBalanceToChange');

describe('e2e', () => {
  describe('Wallet', function main() {
    this.timeout(950000);

    let failed = false;
    let fundedWallet;
    let emptyWallet;
    let restoredWallet;
    let mnemonic;
    let firstTransaction;
    let secondTransaction;

    before(async () => {
      mnemonic = new Mnemonic();
      fundedWallet = await createClientWithFundedWallet();
      emptyWallet = new Dash.Client({
        seeds: getDAPISeeds(),
        network: process.env.NETWORK,
        wallet: {
          mnemonic,
        },
      });
    });

    // Skip test if any prior test in this describe failed
    beforeEach(function beforeEach() {
      if (failed) {
        this.skip();
      }
    });

    afterEach(function afterEach() {
      failed = this.currentTest.state === 'failed';
    });

    after(async () => {
      if (fundedWallet) {
        await fundedWallet.disconnect();
      }

      if (emptyWallet) {
        await emptyWallet.disconnect();
      }

      if (restoredWallet) {
        await restoredWallet.disconnect();
      }
    });

    describe('empty wallet', () => {
      it('should have no transaction at first', async () => {
        const emptyAccount = await emptyWallet.getWalletAccount();

        expect(emptyAccount.getTransactions()).to.be.empty();
      });

      it('should receive a transaction when as it has been sent', async () => {
        const emptyAccount = await emptyWallet.getWalletAccount();
        const fundedAccount = await fundedWallet.getWalletAccount();

        firstTransaction = await fundedAccount.createTransaction({
          recipient: emptyAccount.getUnusedAddress().address,
          satoshis: 1000,
        });

        await Promise.all([
          fundedAccount.broadcastTransaction(firstTransaction),
          waitForBalanceToChange(emptyAccount),
        ]);

        const transactionIds = Object.keys(emptyAccount.getTransactions());

        expect(transactionIds).to.have.lengthOf(1);

        expect(transactionIds[0]).to.equal(firstTransaction.id);
      });
    });

    describe('restored wallet', () => {
      it('should have all transaction from before at first', async () => {
        restoredWallet = new Dash.Client({
          wallet: {
            mnemonic,
          },
          seeds: getDAPISeeds(),
          network: process.env.NETWORK,
        });

        const duplicateAccount = await restoredWallet.getWalletAccount();

        await waitForBalanceToChange(duplicateAccount);

        const transactionIds = Object.keys(duplicateAccount.getTransactions());

        expect(transactionIds).to.have.lengthOf(1);

        expect(transactionIds[0]).to.equal(firstTransaction.id);
      });

      it('should receive a transaction when as it has been sent', async () => {
        const restoredAccount = await restoredWallet.getWalletAccount();
        const fundedAccount = await fundedWallet.getWalletAccount();

        secondTransaction = await fundedAccount.createTransaction({
          recipient: restoredAccount.getUnusedAddress().address,
          satoshis: 1100,
        });

        await fundedAccount.broadcastTransaction(secondTransaction);

        await Promise.all([
          fundedAccount.broadcastTransaction(firstTransaction),
          waitForBalanceToChange(restoredAccount),
        ]);

        const transactionIds = Object.keys(restoredAccount.getTransactions());

        expect(transactionIds).to.have.lengthOf(1);

        expect(transactionIds[0]).to.equal(secondTransaction.id);
      });
    });

    describe('empty wallet', () => {
      it('should receive a transaction when as it has been sent to restored wallet', async () => {
        const emptyAccount = await emptyWallet.getWalletAccount();

        const transactionIds = Object.keys(emptyAccount.getTransactions());

        expect(transactionIds).to.have.lengthOf(2);

        expect(transactionIds).to.have.members([
          firstTransaction.id,
          secondTransaction.id,
        ]);
      });
    });
  });
});
