const cbor = require('cbor');

const hashLength = 32;

module.exports = function getStoreProofData(storeProof) {
  const buf = storeProof;
  const hashes = [];
  const keyValueHashes = [];
  const values = [];

  let x = 0;
  while (x < buf.length) {
    const type = buf.readUInt8(x);
    x += 1;

    switch (type) {
      case 0x01: { // Hash
        hashes.push(buf.slice(x, x + hashLength));
        x += hashLength;
        break;
      }

      case 0x02: { // Key/value hash
        keyValueHashes.push(buf.slice(x, x + hashLength));
        x += hashLength;
        break;
      }

      case 0x03: { // Key / Value
        const keySize = buf.readUInt8(x);
        x += 1;
        x += keySize;

        const valueSize = buf.readUInt16BE(x);
        x += 2;

        // Value
        const value = buf.toString('hex', x, x + valueSize);
        x += valueSize;
        const map = cbor.decode(value);

        values.push(map);
        break;
      }

      case 0x10: // Parent
        break;

      case 0x11: // Child
        break;

      default:
        throw new Error(`Unknown type: ${type.toString(16)}`);
    }
  }

  return { hashes, keyValueHashes, values };
};
