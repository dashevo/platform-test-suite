const {
  PrivateKey,
  PublicKey,
} = require('@dashevo/dashcore-lib');

const DAPIClient = require('@dashevo/dapi-client');
const DashPlatformProtocol = require('@dashevo/dpp');

const GrpcErrorCodes = require('@dashevo/grpc-common/lib/server/error/GrpcErrorCodes');

const getDataContractFixture = require(
  '@dashevo/dpp/lib/test/fixtures/getDataContractFixture',
);

const fundAddress = require('../../../lib/test/fundAddress');
const createOutPointTxFactory = require('../../../lib/test/createOutPointTxFactory');

describe('Platform', function platform() {
  this.timeout(950000);

  let dapiClient;
  let dpp;
  let identityPrivateKey;
  let dataContract;
  let publicKeyId;
  let identity;
  let document;

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
      timeout: 10000,
      addresses: seeds.map(({ service }) => (
        {
          host: service.split(':')[0],
          httpPort: service.split(':')[1],
          grpcPort: 3010,
        }
      )),
    });

    const createOutPointTx = createOutPointTxFactory(dapiClient);

    await dapiClient.core.generateToAddress(10, faucetAddress);

    identityPrivateKey = new PrivateKey();
    const identityPublicKey = new PublicKey({
      ...identityPrivateKey.toPublicKey().toObject(),
      compressed: true,
    });
    const identityAddress = identityPrivateKey
      .toAddress(process.env.NETWORK);

    await fundAddress(dapiClient, faucetAddress, faucetPrivateKey, identityAddress, 10);

    const privateKey = new PrivateKey(faucetPrivateKey);

    publicKeyId = 0;

    dpp = new DashPlatformProtocol({
      dataProvider: {},
    });

    const amount = 10000;

    const outPointTx = await createOutPointTx(amount, faucetAddress, identityPublicKey, privateKey);

    await dapiClient.core.broadcastTransaction(outPointTx.toBuffer());
    await dapiClient.core.generateToAddress(1, faucetAddress);

    const outPoint = outPointTx.getOutPointBuffer(0);

    identity = dpp.identity.create(
      outPoint,
      [identityPublicKey],
    );

    const identityCreateTransition = dpp.identity.createIdentityCreateTransition(identity);
    identityCreateTransition.signByPrivateKey(identityPrivateKey);

    dataContract = getDataContractFixture(identityCreateTransition.getIdentityId());

    const dataContractCreateTransition = dpp.dataContract.createStateTransition(dataContract);
    dataContractCreateTransition.sign(identity.getPublicKeyById(publicKeyId), identityPrivateKey);

    // Create Identity
    await dapiClient.platform.broadcastStateTransition(identityCreateTransition.serialize());

    await dapiClient.platform.broadcastStateTransition(dataContractCreateTransition.serialize());

    document = dpp.document.create(
      dataContract, identity.getId(), 'niceDocument', {
        name: 'someName',
      },
    );
  });

  describe('Document', () => {
    it('should fail to create new document with an unknown type', async () => {
      const newDocument = dpp.document.create(
        dataContract, identity.getId(), 'niceDocument', {
          name: 'someName',
        },
      );

      newDocument.type = 'unknownDocument';

      const documentTransition = dpp.document.createStateTransition({
        create: [newDocument],
      });
      documentTransition.sign(identity.getPublicKeyById(publicKeyId), identityPrivateKey);

      try {
        await dapiClient.platform.broadcastStateTransition(documentTransition.serialize());

        expect.fail('should throw invalid argument error');
      } catch (e) {
        expect(e.code).to.equal(GrpcErrorCodes.INVALID_ARGUMENT);
        expect(e.details).to.equal('State Transition is invalid');
      }
    });

    it('should fail to create new document with invalid data', async () => {
      try {
        await dapiClient.platform.broadcastStateTransition(Buffer.alloc(36));

        expect.fail('should throw invalid argument error');
      } catch (e) {
        expect(e.code).to.equal(GrpcErrorCodes.INVALID_ARGUMENT);
        expect(e.details).to.equal('State Transition is invalid');
      }
    });

    it('should be able to create new document', async () => {
      const documentTransition = dpp.document.createStateTransition({
        create: [document],
      });
      documentTransition.sign(identity.getPublicKeyById(publicKeyId), identityPrivateKey);

      await dapiClient.platform.broadcastStateTransition(documentTransition.serialize());
    });

    it('should fetch created documents array', async () => {
      const [documentBuffer] = await dapiClient.platform.getDocuments(dataContract.getId(), 'niceDocument', {});

      const receivedDocument = await dpp.document.createFromSerialized(
        documentBuffer, { skipValidation: true },
      );

      expect(document.toJSON()).to.deep.equal(receivedDocument.toJSON());
    });
  });
});
