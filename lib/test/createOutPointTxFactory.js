const {
  Transaction,
} = require('@dashevo/dashcore-lib');
const getInputsByAddress = require('./getInputsByAddress');

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
    const inputs = await getInputsByAddress(dapiClient, address);

    if (!inputs.length) {
      throw new Error(`Address ${address} has no inputs to spend`);
    }

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
