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

  describe('Identity', () => {
    it('should fail to create an identity if outpoint was not found');
    it('should create an identity');
    it('should fail to create an identity with the same first public key');
    it('should be able to get newly created identity');
    it('should be able to get newly created identity by it\'s first public key');
    it('should be able to get newly created identity id by it\'s first public key');

    describe('Credits', () => {
      it('should fail to create more documents if there are no more credits');
      it('should fail top-up if transaction has not been sent');
      it('should be able to top-up credit balance');
      it('should be able to create more documents after the top-up');
    });
  });
});
