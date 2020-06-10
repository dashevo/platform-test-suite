const DashPlatformProtocol = require('@dashevo/dpp');
const getDataContractFixture = require('@dashevo/dpp/lib/test/fixtures/getDataContractFixture');

const waitForBlocks = require('../../../lib/waitForBlocks');

const createOutPointTxFactory = require('../../../lib/test/createOutPointTxFactory');
const getClientWithFundedWallet = require('../../../lib/test/getClientWithFundedWallet');

describe('Platform', function platform() {
  this.timeout(950000);

  let dpp;
  let client;
  let identityCreateTransition;
  let identity;
  let createOutPointTx;

  before(async () => {
    client = await getClientWithFundedWallet();

    dpp = new DashPlatformProtocol();

    createOutPointTx = createOutPointTxFactory(client.clients.dapi);
  });

  after(async () => {
    if (client) {
      await client.disconnect();
    }
  });

  describe('Identity', () => {
    it('should fail to create an identity if outpoint was not found', async () => {
      identity = dpp.identity.create(
        Buffer.alloc(36),
        [identity.getPublicKeyById(0).getData()],
      );

      identityCreateTransition = dpp.identity.createIdentityCreateTransition(identity);
      identityCreateTransition.signByPrivateKey(client.account.getIdentityHDKey(0));

      try {
        await client.clients.dapi.platform.broadcastStateTransition(
          identityCreateTransition.serialize(),
        );
        expect.fail('Error was not thrown');
      } catch (e) {
        const [error] = JSON.parse(e.metadata.get('errors'));
        expect(error.name).to.equal('IdentityAssetLockTransactionNotFoundError');
      }
    });

    it('should create an identity', async () => {
      identity = await client.platform.identities.register();
    });

    it('should fail to create an identity with the same first public key', async () => {
      const outPointTx = await createOutPointTx(
        1,
        client.account.getNewAddress().address,
        identity.getPublicKeyById(0).getData(),
        client.account.getIdentityHDKey(0),
      );

      const outPoint = outPointTx.getOutPointBuffer(0);

      await client.clients.dapi.core.broadcastTransaction(outPointTx.toBuffer());
      await waitForBlocks(client, 1);

      const otherIdentity = dpp.identity.create(
        outPoint,
        [identity.getPublicKeyById(0).getData()],
      );

      const otherIdentityCreateTransition = dpp.identity.createIdentityCreateTransition(
        otherIdentity,
      );
      otherIdentityCreateTransition.signByPrivateKey(client.account.getIdentityHDKey(0));

      try {
        await client.clients.dapi.platform.broadcastStateTransition(
          otherIdentityCreateTransition.serialize(),
        );

        expect.fail('Error was not thrown');
      } catch (e) {
        const [error] = JSON.parse(e.metadata.get('errors'));
        expect(error.name).to.equal('IdentityFirstPublicKeyAlreadyExistsError');
        expect(error.publicKeyHash).to.equal(identity.getPublicKeyById(0).hash());
      }
    });

    it('should be able to get newly created identity', async () => {
      const fetchedIdentity = await client.identity.get(
        identity.getIdentityId(),
      );

      expect(fetchedIdentity).to.be.not.null();

      expect(fetchedIdentity.toJSON()).to.deep.equal({
        ...identity.toJSON(),
        balance: 826,
      });

      // updating balance
      identity.setBalance(fetchedIdentity.getBalance());
    });

    it('should be able to get newly created identity by it\'s first public key', async () => {
      const serializedIdentity = await client.clients.dapi.platform.getIdentityByFirstPublicKey(
        identity.getPublicKeyById(0).hash(),
      );

      expect(serializedIdentity).to.be.not.null();

      const receivedIdentity = dpp.identity.createFromSerialized(
        serializedIdentity,
        { skipValidation: true },
      );

      expect(receivedIdentity.toJSON()).to.deep.equal({
        ...identity.toJSON(),
        balance: 826,
      });
    });

    it('should be able to get newly created identity id by it\'s first public key', async () => {
      const identityId = await client.clients.dapi.platform.getIdentityIdByFirstPublicKey(
        identity.getPublicKeyById(0).hash(),
      );

      expect(identityId).to.be.not.null();
      expect(identityId).to.equal(identity.getId());
    });

    describe('Credits', () => {
      let dataContractFixture;

      before(async () => {
        dataContractFixture = getDataContractFixture(identity.getId());
        const dataContract = await client.platform.contracts.create(
          dataContractFixture.getDefinitions(), identity,
        );

        await client.platform.contracts.broadcast(dataContract, identity);

        client.apps.customContracts = {
          contractId: dataContract.getId(),
          contract: dataContract,
        };
      });

      it('should fail to create more documents if there are no more credits', async () => {
        const document = await client.platform.documents.create(
          'customContracts.niceDocument',
          identity,
          {
            name: 'Some Very Long Long Long Name',
          },
        );

        try {
          await client.platform.documents.broadcast({
            create: [document],
          }, identity);

          expect.fail('Error was not thrown');
        } catch (e) {
          expect(e.details).to.equal('Failed precondition: Not enough credits');
        }
      });

      it('should fail top-up if transaction has not been sent', async () => {
        const outPointTx = await createOutPointTx(
          1,
          client.account.getNewAddress().address,
          identity.getPublicKeyById(0).getData(),
          client.account.getIdentityHDKey(0),
        );

        const outPoint = outPointTx.getOutPointBuffer(0);

        const identityTopUpTransition = dpp.identity.createIdentityTopUpTransition(
          identity.getId(),
          outPoint,
        );
        identityTopUpTransition.signByPrivateKey(client.account.getIdentityHDKey(0));

        try {
          await client.clients.dapi.platform.broadcastStateTransition(
            identityTopUpTransition.serialize(),
          );

          expect.fail('Error was not thrown');
        } catch (e) {
          const [error] = JSON.parse(e.metadata.get('errors'));
          expect(error.name).to.equal('IdentityAssetLockTransactionNotFoundError');
        }
      });

      it('should be able to top-up credit balance', async () => {
        const outPointTx = await createOutPointTx(
          1,
          client.account.getNewAddress().address,
          identity.getPublicKeyById(0).getData(),
          client.account.getIdentityHDKey(0),
        );

        const outPoint = outPointTx.getOutPointBuffer(0);

        const identityTopUpTransition = dpp.identity.createIdentityTopUpTransition(
          identity.getId(),
          outPoint,
        );
        identityTopUpTransition.signByPrivateKey(client.account.getIdentityHDKey(0));

        await client.clients.dapi.core.broadcastTransaction(outPointTx.toBuffer());
        await waitForBlocks(client, 1);

        await client.platform.broadcastStateTransition(identityTopUpTransition.serialize());
      });

      it('should be able to create more documents after the top-up', async () => {
        const document = await client.platform.documents.create(
          'customContracts.niceDocument',
          identity,
          {
            name: 'Some Very Long Long Long Name',
          },
        );

        await client.platform.documents.broadcast({
          create: [document],
        }, identity);
      });
    });
  });
});
