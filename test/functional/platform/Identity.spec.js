const DashPlatformProtocol = require('@dashevo/dpp');
const getDataContractFixture = require('@dashevo/dpp/lib/test/fixtures/getDataContractFixture');

const {
  PublicKey,
} = require('@dashevo/dashcore-lib');

const waitForBlocks = require('../../../lib/waitForBlocks');

const createOutPointTxFactory = require('../../../lib/test/createOutPointTxFactory');
const getClientWithFundedWallet = require('../../../lib/test/getClientWithFundedWallet');

describe('Platform', function platform() {
  this.timeout(950000);

  let dpp;
  let client;
  let walletAccount;
  let identityCreateTransition;
  let identity;
  let identityPublicKey;
  let identityPrivateKey;
  let createOutPointTx;

  before(async () => {
    dpp = new DashPlatformProtocol();

    client = await getClientWithFundedWallet();
    walletAccount = await client.getWalletAccount();
    ({
      publicKey: identityPublicKey,
      privateKey: identityPrivateKey,
    } = walletAccount.getIdentityHDKeyByIndex(0, 0));

    createOutPointTx = createOutPointTxFactory(client.getDAPIClient());
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
        [identityPublicKey],
      );

      identityCreateTransition = dpp.identity.createIdentityCreateTransition(identity);
      identityCreateTransition.signByPrivateKey(
        identityPrivateKey,
      );

      try {
        await client.getDAPIClient().applyStateTransition(
          identityCreateTransition,
        );
        expect.fail('Error was not thrown');
      } catch (e) {
        const [error] = JSON.parse(e.metadata.get('errors'));
        expect(error.name).to.equal('IdentityAssetLockTransactionNotFoundError');
      }
    });

    it('should create an identity', async () => {
      identity = await client.platform.identities.register(1);
    });

    it('should fail to create an identity with the same first public key', async () => {
      const outPointTx = await createOutPointTx(
        1,
        walletAccount.getAddress().address,
        identityPublicKey,
        identityPublicKey,
      );

      const outPoint = outPointTx.getOutPointBuffer(0);

      await client.getDAPIClient().sendTransaction(outPointTx.toBuffer());
      await waitForBlocks(client.getDAPIClient(), 1);

      const otherIdentity = dpp.identity.create(
        outPoint,
        [identityPublicKey],
      );

      const otherIdentityCreateTransition = dpp.identity.createIdentityCreateTransition(
        otherIdentity,
      );
      otherIdentityCreateTransition.signByPrivateKey(
        identityPrivateKey,
      );

      try {
        await client.getDAPIClient().applyStateTransition(
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
      const serializedIdentity = await client.getDAPIClient().getIdentityByFirstPublicKey(
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
      const identityId = await client.getDAPIClient().getIdentityIdByFirstPublicKey(
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
          walletAccount.getAddress().address,
          new PublicKey(identity.getPublicKeyById(0).getData()),
          identityPrivateKey,
        );

        const outPoint = outPointTx.getOutPointBuffer(0);

        const identityTopUpTransition = dpp.identity.createIdentityTopUpTransition(
          identity.getId(),
          outPoint,
        );
        identityTopUpTransition.signByPrivateKey(
          identityPrivateKey,
        );

        try {
          await client.getDAPIClient().applyStateTransition(
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
          walletAccount.getAddress().address,
          new PublicKey(identity.getPublicKeyById(0).getData()),
          identityPrivateKey,
        );

        const outPoint = outPointTx.getOutPointBuffer(0);

        const identityTopUpTransition = dpp.identity.createIdentityTopUpTransition(
          identity.getId(),
          outPoint,
        );
        identityTopUpTransition.signByPrivateKey(
          identityPrivateKey,
        );

        await client.getDAPIClient().sendTransaction(outPointTx.toBuffer());
        await waitForBlocks(client.getDAPIClient(), 1);

        await client.getDAPIClient().applyStateTransition(identityTopUpTransition.serialize());
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
