const {
  Transaction,
} = require('@dashevo/dashcore-lib');

/**
 * @param {DAPIClient} dapiClient
 *
 * @returns {createOutPointTx}
 */
function createOutPointTxFactory(dapiClient) {
  /**
   * @typedef createOutPointTx
   *
   * @param {number} amount
   * @param {string} address
   * @param {PublicKey} publicKey
   * @param {PrivateKey} privateKey
   *
   * @returns {Promise<Transaction>}
   */
  async function createOutPointTx(amount, address, publicKey, privateKey) {
    const { blocks } = await dapiClient.core.getStatus();
    const { items: utxos } = await dapiClient.core.getUTXO(address);

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
    } while (sum < 1 && i < sortedUtxos.length);

    const outPointTx = new Transaction();

    outPointTx.from(inputs)
      .addBurnOutput(amount, publicKey.hash)
      .change(address)
      .fee(668)
      .sign(privateKey);

    return outPointTx;
  }

  return createOutPointTx;
}

module.exports = createOutPointTxFactory;
