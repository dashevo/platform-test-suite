const {
  Transaction,
} = require('@dashevo/dashcore-lib');

const wait = require('../wait');

/**
 *
 * @param {DAPIClient} dapiClient
 * @param {Address} faucetAddress
 * @param {PrivateKey} faucetPrivateKey
 * @param {Address} address
 * @return {Promise<string>}
 */
async function fundAddress(dapiClient, faucetAddress, faucetPrivateKey, address) {
  const { items: inputs } = await dapiClient.getUTXO(faucetAddress.toString());

  const transaction = new Transaction();

  transaction.from(inputs.slice(-1)[0])
    .to(address, 20000)
    .change(faucetAddress)
    .fee(668)
    .sign(faucetPrivateKey);

  const transactionId = await dapiClient.sendTransaction(transaction.toBuffer());

  await dapiClient.generateToAddress(1, faucetAddress.toString());
  await wait(5000);

  return transactionId;
}

module.exports = fundAddress;
