const {
  PrivateKey,
} = require('@dashevo/dashcore-lib');

const wait = require('./wait');

/**
 *
 * @param {Client} client
 * @param {number} numberOfBlocks
 * @return {Promise<void>}
 */
module.exports = async function waitForBlocks(client, numberOfBlocks) {
  if (process.env.REGTEST === 'true') {
    const privateKey = new PrivateKey();

    await client.clients.dapi.core.generateToAddress(numberOfBlocks, privateKey.toAddress());
  } else {
    let { blocks: currentBlockHeight } = await client.clients.dapi.core.getStatus();

    const desiredBlockHeight = currentBlockHeight + numberOfBlocks;
    do {
      ({ blocks: currentBlockHeight } = await client.clients.dapi.core.getStatus());

      if (currentBlockHeight < desiredBlockHeight) {
        await wait(30000);
      }
    } while (currentBlockHeight < desiredBlockHeight);
  }
};
