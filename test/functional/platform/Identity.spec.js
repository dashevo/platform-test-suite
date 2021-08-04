const DashPlatformProtocol = require('@dashevo/dpp');
const getDataContractFixture = require('@dashevo/dpp/lib/test/fixtures/getDataContractFixture');
const generateRandomIdentifier = require('@dashevo/dpp/lib/test/utils/generateRandomIdentifier');

const { verifyProof, executeProof } = require('@dashevo/merk');
const { MerkleTree } = require('merkletreejs');

const { createFakeInstantLock } = require('dash/build/src/utils/createFakeIntantLock');
const { default: createAssetLockProof } = require('dash/build/src/SDK/Client/Platform/methods/identities/internal/createAssetLockProof');
const { default: createIdentityCreateTransition } = require('dash/build/src/SDK/Client/Platform/methods/identities/internal/createIdentityCreateTransition');
const { default: createIdentityTopUpTransition } = require('dash/build/src/SDK/Client/Platform/methods/identities/internal/createIdnetityTopUpTransition');
const { default: createAssetLockTransaction } = require('dash/build/src/SDK/Client/Platform/createAssetLockTransaction');

const waitForBlocks = require('../../../lib/waitForBlocks');
const waitForBalanceToChange = require('../../../lib/test/waitForBalanceToChange');

const createClientWithFundedWallet = require('../../../lib/test/createClientWithFundedWallet');
const wait = require('../../../lib/wait');

const parseRootTreeProof = require('../../../lib/parseRootTreeProof');
const parseStoreTreeProof = require('../../../lib/parseStoreTreeProof');
const { init: initHashFunction, hashFunction: proofHashFunction } = require('../../../lib/proofHashFunction');

describe('Platform', () => {
  describe('Identity', () => {
    let dpp;
    let client;
    let identity;
    let walletAccount;
    let walletPublicKey;

    before(async () => {
      dpp = new DashPlatformProtocol();
      await dpp.initialize();

      await initHashFunction();

      client = await createClientWithFundedWallet();
      walletAccount = await client.getWalletAccount();
      ({
        publicKey: walletPublicKey,
      } = walletAccount.identities.getIdentityHDKeyByIndex(0, 0));
    });

    after(async () => {
      if (client) {
        await client.disconnect();
      }
    });

    it('should create an identity', async () => {
      identity = await client.platform.identities.register(3);

      expect(identity).to.exist();

      await waitForBalanceToChange(walletAccount);
    });

    it('should fail to create an identity if instantLock is not valid', async () => {
      const {
        transaction,
        privateKey,
        outputIndex,
      } = await createAssetLockTransaction({
        client,
      }, 1);

      const invalidInstantLock = createFakeInstantLock(transaction.hash);
      const assetLockProof = await dpp.identity.createInstantAssetLockProof(
        invalidInstantLock,
        transaction,
        outputIndex,
      );

      const {
        identityCreateTransition: invalidIdentityCreateTransition,
      } = await createIdentityCreateTransition(
        client.platform, assetLockProof, privateKey,
      );

      let broadcastError;

      try {
        await client.platform.broadcastStateTransition(
          invalidIdentityCreateTransition,
        );
      } catch (e) {
        broadcastError = e;
      }

      expect(broadcastError).to.exist();
      expect(broadcastError.message).to.be.equal('State Transition is invalid: InvalidIdentityAssetLockProofSignatureError: Invalid Asset lock proof signature');
      expect(broadcastError.code).to.be.equal(3);
      const [error] = broadcastError.data.errors;
      expect(error.name).to.equal('InvalidIdentityAssetLockProofSignatureError');
    });

    it('should fail to create an identity with already used asset lock output', async () => {
      const {
        transaction,
        privateKey,
        outputIndex,
      } = await createAssetLockTransaction({ client }, 1);

      await client.getDAPIClient().core.broadcastTransaction(transaction.toBuffer());
      await waitForBlocks(client.getDAPIClient(), 1);

      const assetLockProof = await createAssetLockProof(client.platform, transaction, outputIndex);

      // Creating normal transition
      const {
        identity: identityOne,
        identityCreateTransition: identityCreateTransitionOne,
        identityIndex: identityOneIndex,
      } = await createIdentityCreateTransition(
        client.platform, assetLockProof, privateKey,
      );

      await client.platform.broadcastStateTransition(
        identityCreateTransitionOne,
      );

      walletAccount.storage.insertIdentityIdAtIndex(
        walletAccount.walletId,
        identityOne.getId().toString(),
        identityOneIndex,
      );

      // Creating transition that tries to spend the same transaction
      const {
        identityCreateTransition: identityCreateDoubleSpendTransition,
      } = await createIdentityCreateTransition(
        client.platform, assetLockProof, privateKey,
      );

      let broadcastError;

      try {
        await client.platform.broadcastStateTransition(
          identityCreateDoubleSpendTransition,
        );
      } catch (e) {
        broadcastError = e;
      }

      expect(broadcastError).to.exist();
      expect(broadcastError.message).to.be.equal('State Transition is invalid: IdentityAssetLockTransactionOutPointAlreadyExistsError: Asset lock transaction outPoint already exists');
      expect(broadcastError.code).to.be.equal(3);
      const [error] = broadcastError.data.errors;
      expect(error.name).to.equal('IdentityAssetLockTransactionOutPointAlreadyExistsError');
    });

    it('should fail to create an identity with already used public key', async () => {
      const {
        transaction,
        privateKey,
        outputIndex,
      } = await createAssetLockTransaction({ client }, 1);

      await client.getDAPIClient().core.broadcastTransaction(transaction.toBuffer());
      await waitForBlocks(client.getDAPIClient(), 1);

      const assetLockProof = await createAssetLockProof(client.platform, transaction, outputIndex);

      const duplicateIdentity = dpp.identity.create(
        assetLockProof,
        [walletPublicKey],
      );

      const duplicateIdentityCreateTransition = dpp.identity.createIdentityCreateTransition(
        duplicateIdentity,
      );

      duplicateIdentityCreateTransition.signByPrivateKey(
        privateKey,
      );

      let broadcastError;

      try {
        await client.platform.broadcastStateTransition(
          duplicateIdentityCreateTransition,
        );
      } catch (e) {
        broadcastError = e;
      }

      expect(broadcastError).to.exist();

      expect(broadcastError.message).to.be.equal('Invalid state transition: IdentityPublicKeyAlreadyExistsError: Identity public key already exists');
      expect(broadcastError.code).to.be.equal(2);
      const [error] = broadcastError.data.errors;
      expect(error.name).to.equal('IdentityPublicKeyAlreadyExistsError');
      expect(Buffer.from(error.publicKeyHash)).to.deep.equal(identity.getPublicKeyById(0).hash());
    });

    it('should be able to get newly created identity', async () => {
      const fetchedIdentity = await client.platform.identities.get(
        identity.getId(),
      );

      expect(fetchedIdentity).to.be.not.null();

      const fetchedIdentityWithoutBalance = fetchedIdentity.toJSON();
      delete fetchedIdentityWithoutBalance.balance;

      const localIdentityWithoutBalance = identity.toJSON();
      delete localIdentityWithoutBalance.balance;

      expect(fetchedIdentityWithoutBalance).to.deep.equal(localIdentityWithoutBalance);

      expect(fetchedIdentity.getBalance()).to.be.greaterThan(0);
    });

    it('should be able to get newly created identity by it\'s first public key', async () => {
      const response = await client.getDAPIClient().platform
        .getIdentitiesByPublicKeyHashes(
          [identity.getPublicKeyById(0).hash()],
        );

      const [serializedIdentity] = response.getIdentities();

      expect(serializedIdentity).to.be.not.null();

      const receivedIdentity = dpp.identity.createFromBuffer(
        serializedIdentity,
        { skipValidation: true },
      );

      const receivedIdentityWithoutBalance = receivedIdentity.toJSON();
      delete receivedIdentityWithoutBalance.balance;

      const localIdentityWithoutBalance = identity.toJSON();
      delete localIdentityWithoutBalance.balance;

      expect(receivedIdentityWithoutBalance).to.deep.equal(localIdentityWithoutBalance);
      expect(receivedIdentity.getBalance()).to.be.greaterThan(0);
    });

    it('should be able to get newly created identity id by it\'s first public key', async () => {
      const response = await client.getDAPIClient().platform.getIdentityIdsByPublicKeyHashes(
        [identity.getPublicKeyById(0).hash()],
      );

      const [identityId] = response.getIdentityIds();

      expect(identityId).to.be.not.null();
      expect(identityId).to.deep.equal(identity.getId());
    });

    describe('chainLock', () => {
      let chainLockIdentity;

      it('should create identity using chainLock', async () => {
        const {
          transaction,
          privateKey,
          outputIndex,
        } = await createAssetLockTransaction({
          client,
        }, 1);

        // Broadcast Asset Lock transaction
        await client.getDAPIClient().core.broadcastTransaction(transaction.toBuffer());
        await waitForBlocks(client.getDAPIClient(), 1);

        const { chain } = await client.getDAPIClient().core.getStatus();

        const outPoint = transaction.getOutPointBuffer(outputIndex);
        const assetLockProof = await dpp.identity.createChainAssetLockProof(
          chain.blocksCount,
          outPoint,
        );

        let coreChainLockedHeight = 0;
        while (coreChainLockedHeight < chain.blocksCount) {
          const identityResponse = await client.platform.identities.get(identity.getId());

          const metadata = identityResponse.getMetadata();
          coreChainLockedHeight = metadata.getCoreChainLockedHeight();

          if (coreChainLockedHeight >= chain.blocksCount) {
            break;
          }

          await wait(5000);
        }

        const identityCreateTransitionData = await createIdentityCreateTransition(
          client.platform, assetLockProof, privateKey,
        );

        const {
          identityCreateTransition,
        } = identityCreateTransitionData;

        ({ identity: chainLockIdentity } = identityCreateTransitionData);

        await client.platform.broadcastStateTransition(
          identityCreateTransition,
        );

        expect(chainLockIdentity).to.exist();

        await waitForBalanceToChange(walletAccount);
      });

      it('should be able to get newly created identity', async () => {
        const fetchedIdentity = await client.platform.identities.get(
          chainLockIdentity.getId(),
        );

        expect(fetchedIdentity).to.be.not.null();

        const fetchedIdentityWithoutBalance = fetchedIdentity.toJSON();
        delete fetchedIdentityWithoutBalance.balance;

        const localIdentityWithoutBalance = chainLockIdentity.toJSON();
        delete localIdentityWithoutBalance.balance;

        expect(fetchedIdentityWithoutBalance).to.deep.equal(localIdentityWithoutBalance);

        expect(fetchedIdentity.getBalance()).to.be.greaterThan(0);
      });
    });

    describe('Credits', () => {
      let dataContractFixture;

      before(async () => {
        dataContractFixture = getDataContractFixture(identity.getId());

        await client.platform.contracts.broadcast(dataContractFixture, identity);

        client.getApps().set('customContracts', {
          contractId: dataContractFixture.getId(),
          contract: dataContractFixture,
        });
      });

      it('should fail to create more documents if there are no more credits', async () => {
        const document = await client.platform.documents.create(
          'customContracts.niceDocument',
          identity,
          {
            name: 'Some Very Long Long Long Name'.repeat(100),
          },
        );

        let broadcastError;

        try {
          await client.platform.documents.broadcast({
            create: [document],
          }, identity);
        } catch (e) {
          broadcastError = e;
        }

        expect(broadcastError).to.exist();
        expect(broadcastError.message).to.be.equal('Failed precondition: Not enough credits');
        expect(broadcastError.code).to.be.equal(9);
      });

      it.skip('should fail top-up if instant lock is not valid', async () => {
        await waitForBalanceToChange(walletAccount);

        const {
          transaction,
          privateKey,
          outputIndex,
        } = await createAssetLockTransaction({
          client,
        }, 1);

        const instantLock = createFakeInstantLock(transaction.hash);
        const assetLockProof = await dpp.identity.createInstantAssetLockProof(instantLock);

        const identityTopUpTransition = dpp.identity.createIdentityTopUpTransition(
          identity.getId(),
          transaction,
          outputIndex,
          assetLockProof,
        );
        identityTopUpTransition.signByPrivateKey(
          privateKey,
        );

        let broadcastError;

        try {
          await client.platform.broadcastStateTransition(
            identityTopUpTransition,
          );
        } catch (e) {
          broadcastError = e;
        }

        expect(broadcastError).to.exist();
        expect(broadcastError.message).to.be.equal('State Transition is invalid: InvalidIdentityAssetLockProofSignatureError: Invalid Asset lock proof signature');
        expect(broadcastError.code).to.be.equal(3);
        const [error] = broadcastError.data.errors;
        expect(error.name).to.equal('IdentityAssetLockTransactionNotFoundError');
      });

      it('should be able to top-up credit balance', async () => {
        await waitForBalanceToChange(walletAccount);

        const identityBeforeTopUp = await client.platform.identities.get(
          identity.getId(),
        );
        const balanceBeforeTopUp = identityBeforeTopUp.getBalance();
        const topUpAmount = 100;
        const topUpCredits = topUpAmount * 1000;

        await client.platform.identities.topUp(identity.getId(), topUpAmount);

        await waitForBalanceToChange(walletAccount);

        const identityAfterTopUp = await client.platform.identities.get(
          identity.getId(),
        );

        expect(identityAfterTopUp.getBalance()).to.be.greaterThan(balanceBeforeTopUp);
        expect(identityAfterTopUp.getBalance()).to.be.lessThan(balanceBeforeTopUp + topUpCredits);
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

      it('should fail to top up an identity with already used asset lock output', async () => {
        const {
          transaction,
          privateKey,
          outputIndex,
        } = await createAssetLockTransaction({ client }, 1);

        await client.getDAPIClient().core.broadcastTransaction(transaction.toBuffer());
        await waitForBlocks(client.getDAPIClient(), 1);

        const assetLockProof = await createAssetLockProof(
          client.platform,
          transaction,
          outputIndex,
        );

        // Creating normal transition
        const identityTopUpTransitionOne = await createIdentityTopUpTransition(
          client.platform, assetLockProof, privateKey, identity.getId(),
        );
        // Creating ST that tries to spend the same output
        const conflictingTopUpStateTransition = await createIdentityTopUpTransition(
          client.platform, assetLockProof, privateKey, identity.getId(),
        );

        await client.platform.broadcastStateTransition(
          identityTopUpTransitionOne,
        );

        let broadcastError;

        try {
          await client.platform.broadcastStateTransition(
            conflictingTopUpStateTransition,
          );
        } catch (e) {
          broadcastError = e;
        }

        expect(broadcastError).to.exist();
        expect(broadcastError.message).to.be.equal('State Transition is invalid: IdentityAssetLockTransactionOutPointAlreadyExistsError: Asset lock transaction outPoint already exists');
        expect(broadcastError.code).to.be.equal(3);
        const [error] = broadcastError.data.errors;
        expect(error.name).to.equal('IdentityAssetLockTransactionOutPointAlreadyExistsError');
      });
    });

    describe('Proofs', () => {
      it('should be able to get and verify proof that identity exists with getIdentity', async () => {
        identity = await client.platform.identities.register(5);

        expect(identity).to.exist();

        await waitForBalanceToChange(walletAccount);

        const identityProof = await client.getDAPIClient().platform.getIdentity(
          identity.getId(), { prove: true },
        );

        const fullProof = identityProof.proof;

        expect(fullProof).to.exist();

        expect(fullProof.rootTreeProof).to.be.an.instanceof(Uint8Array);
        expect(fullProof.rootTreeProof.length).to.be.greaterThan(0);

        expect(fullProof.storeTreeProof).to.be.an.instanceof(Uint8Array);
        expect(fullProof.storeTreeProof.length).to.be.greaterThan(0);

        expect(fullProof.signatureLLMQHash).to.be.an.instanceof(Uint8Array);
        expect(fullProof.signatureLLMQHash.length).to.be.equal(32);

        expect(fullProof.signature).to.be.an.instanceof(Uint8Array);
        expect(fullProof.signature.length).to.be.equal(96);

        const rootHashes = parseRootTreeProof(fullProof.rootTreeProof);
        const parsedStoreTreeProof = parseStoreTreeProof(fullProof.storeTreeProof);

        expect(identity.getId()).to.be.deep.equal(parsedStoreTreeProof.values[0].id);

        console.dir(rootHashes);
        console.dir(parsedStoreTreeProof);

        const { rootHash: identityLeafRoot } = executeProof(fullProof.storeTreeProof);
        const identityLeafRootHash = proofHashFunction(identityLeafRoot);

        console.log('Execution result:');
        console.dir(identityLeafRoot);
        console.dir(identityLeafRootHash);
        console.log(rootHashes.findIndex((hash) => hash.toString('hex') === identityLeafRootHash.toString('hex')));

        const verificationResult = verifyProof(
          fullProof.storeTreeProof,
          [identity.getId()],
          rootHashes[rootHashes.length - 1].data,
        );

        console.dir(verificationResult);
      });

      it('should be able to verify proof that identity does not exist', async () => {
        // The same as above, but for an identity id that doesn't exist

        const fakeIdentityId = generateRandomIdentifier();

        const identityProof = await client.getDAPIClient().platform.getIdentity(
          fakeIdentityId, { prove: true },
        );

        const fullProof = identityProof.proof;

        expect(fullProof).to.exist();

        expect(fullProof.rootTreeProof).to.be.an.instanceof(Uint8Array);
        expect(fullProof.rootTreeProof.length).to.be.greaterThan(0);

        expect(fullProof.storeTreeProof).to.be.an.instanceof(Uint8Array);
        expect(fullProof.storeTreeProof.length).to.be.greaterThan(0);

        expect(fullProof.signatureLLMQHash).to.be.an.instanceof(Uint8Array);
        expect(fullProof.signatureLLMQHash.length).to.be.equal(32);

        expect(fullProof.signature).to.be.an.instanceof(Uint8Array);
        expect(fullProof.signature.length).to.be.equal(96);

        const rootHashes = parseRootTreeProof(fullProof.rootTreeProof);
        const parsedStoreTreeProof = parseStoreTreeProof(fullProof.storeTreeProof);

        console.dir(rootHashes);
        console.dir(parsedStoreTreeProof);

        const identitiesFromProof = parsedStoreTreeProof.values;

        const valueIds = identitiesFromProof.map((identityValue) => identityValue.id.toString('hex'));

        // The proof will contain left and right values to the empty place
        expect(valueIds.indexOf(fakeIdentityId.toString('hex'))).to.be.equal(-1);

        const { rootHash: identityLeafRoot } = executeProof(fullProof.storeTreeProof);

        const identityIdsToProve = [fakeIdentityId];

        const verificationResult = verifyProof(
          fullProof.storeTreeProof,
          identityIdsToProve,
          identityLeafRoot,
        );

        // We pass one key
        expect(verificationResult.length).to.be.equal(1);
        // Identity with id at index 0 doesn't exist
        expect(verificationResult[0]).to.be.null();

        const leaves = rootHashes.map((hash) => hash.data);
        const tree = new MerkleTree(leaves, proofHashFunction);
        const root = tree.getRoot().toString('hex');
        const leaf = identityLeafRoot;
        // const proof = tree.getProof(leaf);

        expect(tree.verify(leaves, leaf, root)).to.be.true(); // true
      });

      it('should be able to verify that multiple identities exist with getIdentitiesByPublicKeyHashes', () => {

      });
      it('should be able to verify identityIds with getIdentityIdsByPublicKeyHashes', () => {

      });
    });
  });
});
