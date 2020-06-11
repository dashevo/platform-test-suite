const {
  Transaction,
} = require('@dashevo/dashcore-lib');

const waitForBlocks = require('../waitForBlocks');

/**
 *
 * @param {DAPIClient} dapiClient
 * @param {Address} faucetAddress
 * @param {PrivateKey} faucetPrivateKey
 * @param {Address} address
 * @param {number} amount
 * @return {Promise<string>}
 */
async function fundAddress(dapiClient, faucetAddress, faucetPrivateKey, address, amount) {
  const { items: inputs } = await dapiClient.getUTXO(faucetAddress);

  const transaction = new Transaction();

  transaction.from(inputs.slice(-1)[0])
    .to(address, amount)
    .change(faucetAddress)
    .fee(668)
    .sign(faucetPrivateKey);

  const transactionId = await dapiClient.applyStateTransition(transaction.toBuffer());

  await waitForBlocks(dapiClient, 2);

  return transactionId;
}

module.exports = fundAddress;
