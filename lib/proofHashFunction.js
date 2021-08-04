const blake3Promise = require('blake3/dist/node');
const Buffer = require('buffer');

// Including this file in the same file as merk segfaults the test,
// so webasm used instead
let blake3;
async function init() {
  blake3 = await blake3Promise;
}

/**
 * @param {Buffer} data
 * @return {Buffer}
 */
function hashFunction(data) {
  const hash = blake3.hash(data);
  const buffer = Buffer.from(hash);
  // As per instruction in blake 3 module, hash is raw memory and needs manual disposal
  hash.dispose();
  return buffer;
}

module.exports = { init, hashFunction };
