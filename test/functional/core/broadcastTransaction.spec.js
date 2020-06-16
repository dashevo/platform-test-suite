const {
  Transaction,
  PrivateKey,
} = require('@dashevo/dashcore-lib');

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
      const faucetPrivateKey = PrivateKey.fromString(process.env.FAUCET_PRIVATE_KEY);
      const faucetAddress = faucetPrivateKey
        .toAddress(process.env.NETWORK)
        .toString();

      const address = new PrivateKey()
        .toAddress(process.env.NETWORK)
        .toString();

      const { blocks } = await client.getDAPIClient().getStatus();

      const { items: utxos } = await client.getDAPIClient().getUTXO(faucetAddress);

      const amount = 10000;

      const sortedUtxos = utxos
        .filter((utxo) => utxo.height < blocks - 100)
        .sort((a, b) => a.satoshis > b.satoshis);

      const inputs = [];
      let sum = 0;
      let i = 0;

      do {
        const input = sortedUtxos[i];
        inputs.push(input);
        sum += input.satoshis;

        ++i;
      } while (sum < amount && i < sortedUtxos.length);

      const transaction = new Transaction();

      transaction.from(inputs.slice(-1)[0])
        .to(address, amount)
        .change(faucetAddress)
        .fee(668)
        .sign(faucetPrivateKey);

      const serializedTransaction = Buffer.from(transaction.serialize(), 'hex');

      const result = await client.getDAPIClient().sendTransaction(serializedTransaction);

      expect(result).to.be.a('string');
    });
  });
});
