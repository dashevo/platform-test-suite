const GrpcErrorCodes = require('@dashevo/grpc-common/lib/server/error/GrpcErrorCodes');

const getDataContractFixture = require(
  '@dashevo/dpp/lib/test/fixtures/getDataContractFixture',
);

const getClientWithFundedWallet = require('../../../lib/test/getClientWithFundedWallet');

describe('Platform', function platform() {
  this.timeout(950000);

  let client;
  let dataContractFixture;
  let identity;
  let document;

  before(async () => {
    client = await getClientWithFundedWallet();

    identity = await client.platform.identities.register();

    dataContractFixture = getDataContractFixture(identity.getId());

    await client.platform.contracts.broadcast(dataContractFixture, identity);

    client.apps.customContracts = {
      contractId: dataContractFixture.getId(),
      contract: dataContractFixture,
    };
  });

  after(async () => {
    if (client) {
      await client.disconnect();
    }
  });

  describe('Document', () => {
    it('should fail to create new document with an unknown type', async () => {
      const newDocument = await client.platform.documents.create(
        'customContracts.niceDocument',
        identity,
        {
          name: 'anotherName',
        },
      );

      newDocument.type = 'unknownDocument';

      try {
        await client.platform.documents.broadcast({
          create: [newDocument],
        }, identity);

        expect.fail('should throw invalid argument error');
      } catch (e) {
        expect(e.code).to.equal(GrpcErrorCodes.INVALID_ARGUMENT);
        expect(e.details).to.equal('State Transition is invalid');
      }
    });

    it('should be able to create new document', async () => {
      document = await client.platform.documents.create(
        'customContracts.niceDocument',
        identity,
        {
          name: 'myName',
        },
      );

      await client.platform.documents.broadcast({
        create: [document],
      }, identity);
    });

    it('should fetch created documents array', async () => {
      const [fetchedDocument] = await client.platform.documents.get(
        'customContracts.niceDocument',
        { where: [['$id', '==', document.getId()]] },
      );

      expect(document.toJSON()).to.deep.equal(fetchedDocument.toJSON());
    });
  });
});
