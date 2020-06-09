const {
  PrivateKey,
  PublicKey,
  Transaction,
} = require('@dashevo/dashcore-lib');

const DashPlatformProtocol = require('@dashevo/dpp');

const DAPIClient = require('@dashevo/dapi-client');
const DAPIAddress = require('@dashevo/dapi-client/lib/dapiAddressProvider/DAPIAddress');

const Identity = require('@dashevo/dpp/lib/identity/Identity');

const fundAddress = require('../../../lib/test/fundAddress');

describe('Platform', function platform() {
  this.timeout(950000);

  let dpp;
  let dapiClient;

  let identityPrivateKey;
  let identityPublicKey;
  let identityAddress;

  before(async () => {
    dpp = new DashPlatformProtocol();

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

    await dapiClient.core.generateToAddress(10, faucetAddress);

    identityPrivateKey = new PrivateKey();
    identityPublicKey = new PublicKey({
      ...identityPrivateKey.toPublicKey().toObject(),
      compressed: true,
    });
    identityAddress = identityPrivateKey
      .toAddress(process.env.NETWORK)
      .toString();

    await fundAddress(dapiClient, faucetAddress, faucetPrivateKey, identityAddress, 3);
  });

  describe('Identity', () => {
    let outPointTx;

    before(async () => {
      const { items: inputs } = await dapiClient.core.getUTXO(identityAddress);

      outPointTx = new Transaction();

      outPointTx.from(inputs.slice(-1)[0])
        .addBurnOutput(1, identityPublicKey.hash)
        .change(identityAddress)
        .fee(668)
        .sign(identityPrivateKey);
    });

    it('should fail to create an identity if outpoint was not found', async () => {
      const identity = dpp.identity.create(
        Buffer.alloc(36),
        [identityPublicKey],
      );

      const identityCreateTransition = dpp.identity.createIdentityCreateTransition(identity);
      identityCreateTransition.signByPrivateKey(identityPrivateKey);

      try {
        await dapiClient.platform.broadcastStateTransition(identityCreateTransition.serialize());
        expect.fail('Error was not thrown');
      } catch (e) {
        const [error] = JSON.parse(e.metadata.get('errors'));
        expect(error.name).to.equal('IdentityAssetLockTransactionNotFoundError');
      }
    });

    it('should create an identity', async () => {
      await dapiClient.core.broadcastTransaction(outPointTx.toBuffer());
      await dapiClient.core.generateToAddress(1, identityAddress);

      const outPoint = outPointTx.getOutPointBuffer(0);

      const identity = dpp.identity.create(
        outPoint,
        [identityPublicKey],
      );

      const identityCreateTransition = dpp.identity.createIdentityCreateTransition(identity);
      identityCreateTransition.signByPrivateKey(identityPrivateKey);

      await dapiClient.platform.broadcastStateTransition(identityCreateTransition.serialize());
    });

    it('should fail to create an identity with the same first public key', async () => {
      const outPoint = outPointTx.getOutPointBuffer(0);

      const identity = dpp.identity.create(
        outPoint,
        [identityPublicKey],
      );

      const identityCreateTransition = dpp.identity.createIdentityCreateTransition(identity);
      identityCreateTransition.signByPrivateKey(identityPrivateKey);

      await dapiClient.platform.broadcastStateTransition(identityCreateTransition.serialize());
    });

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
