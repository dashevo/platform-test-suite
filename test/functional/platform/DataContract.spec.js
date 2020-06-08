const {
  PrivateKey,
} = require('@dashevo/dashcore-lib');

const Dash = require('dash');
const DAPIClient = require('@dashevo/dapi-client');

const Identity = require('@dashevo/dpp/lib/identity/Identity');

const fundAddress = require('../../../lib/test/fundAddress');

describe('Platform', function platform() {
  this.timeout(950000);

  let dapiClient;

  let identityPrivateKey;
  let identityAddress;

  before(async () => {
    const seeds = process.env.DAPI_SEED
      .split(',')
      .map((seed) => ({ service: `${seed}` }));

    // Prepare to fund Bob and Alice wallets
    const faucetPrivateKey = PrivateKey.fromString(process.env.FAUCET_PRIVATE_KEY);
    const faucetAddress = faucetPrivateKey
      .toAddress(process.env.NETWORK)
      .toString();

    dapiClient = new DAPIClient({
      addresses: seeds.map(({ service }) => (
        {
          host: service.split(':')[0],
          httpPort: service.split(':')[1],
          grpcPort: 3010,
        }
      )),
    });

    identityPrivateKey = new PrivateKey();
    identityAddress = identityPrivateKey.toAddress();

    await fundAddress(dapiClient, faucetAddress, faucetPrivateKey, identityAddress, 10);
  });

  describe('Data contract', () => {
    it('should fail to create new data contract with invalid data');
    it('should fail to create new data contract with unknown owner');
    it('should create new data contract with previously created identity as an owner');
    it('should be able to get newly created data contract');
  });
});
