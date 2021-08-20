const getDataContractFixture = require(
  '@dashevo/dpp/lib/test/fixtures/getDataContractFixture',
);

const { executeProof, verifyProof } = require('@dashevo/merk');
const generateRandomIdentifier = require('@dashevo/dpp/lib/test/utils/generateRandomIdentifier');
const createClientWithFundedWallet = require('../../../lib/test/createClientWithFundedWallet');
const waitForBalanceToChange = require('../../../lib/test/waitForBalanceToChange');
const parseStoreTreeProof = require('../../../lib/parseStoreTreeProof');

describe('Platform', () => {
  describe('Data Contract', function main() {
    this.timeout(700000);

    let client;
    let dataContractFixture;
    let identity;

    before(async () => {
      client = await createClientWithFundedWallet();

      identity = await client.platform.identities.register(3);
    });

    after(async () => {
      if (client) {
        await client.disconnect();
      }
    });

    it('should fail to create new data contract with unknown owner', async () => {
      // if no identity is specified
      // random is generated within the function
      dataContractFixture = getDataContractFixture();

      let broadcastError;

      try {
        await client.platform.contracts.broadcast(dataContractFixture, identity);
      } catch (e) {
        broadcastError = e;
      }

      expect(broadcastError).to.exist();
      const [error] = JSON.parse(broadcastError.message.replace('StateTransition is invalid - ', ''));
      expect(error.name).to.equal('IdentityNotFoundError');
    });

    it('should create new data contract with previously created identity as an owner', async () => {
      dataContractFixture = getDataContractFixture(identity.getId());

      await client.platform.contracts.broadcast(dataContractFixture, identity);
    });

    it('should be able to get newly created data contract', async () => {
      const fetchedDataContract = await client.platform.contracts.get(
        dataContractFixture.getId(),
      );

      expect(fetchedDataContract).to.be.not.null();
      expect(dataContractFixture.toJSON()).to.deep.equal(fetchedDataContract.toJSON());
    });

    describe('Proofs', () => {
      it('should be able to get and verify proof that identity exists with getIdentity', async () => {
        // dataContractFixture = getDataContractFixture();
        const dataContractId = dataContractFixture.getId();
        // await client.platform.contracts.broadcast(dataContractFixture, identity);

        const identityProof = await client.getDAPIClient().platform.getDataContract(
          dataContractId, { prove: true },
        );

        const fullProof = identityProof.proof;

        expect(fullProof).to.exist();

        expect(fullProof.rootTreeProof).to.be.an.instanceof(Uint8Array);
        expect(fullProof.rootTreeProof.length).to.be.greaterThan(0);
        expect(fullProof.storeTreeProofs).to.exist();

        const dataContractsProofBuffer = fullProof.storeTreeProofs.getDataContractsProof();

        expect(dataContractsProofBuffer).to.be.an.instanceof(Uint8Array);
        expect(dataContractsProofBuffer.length).to.be.greaterThan(0);

        expect(fullProof.signatureLLMQHash).to.be.an.instanceof(Uint8Array);
        expect(fullProof.signatureLLMQHash.length).to.be.equal(32);

        expect(fullProof.signature).to.be.an.instanceof(Uint8Array);
        expect(fullProof.signature.length).to.be.equal(96);

        const parsedStoreTreeProof = parseStoreTreeProof(dataContractsProofBuffer);

        expect(dataContractId).to.be.deep.equal(parsedStoreTreeProof.values[0].id);

        const { rootHash: dataContractsLeafRoot } = executeProof(dataContractsProofBuffer);

        const verificationResult = verifyProof(
          dataContractsProofBuffer,
          [dataContractId],
          dataContractsLeafRoot,
        );

        // We pass one key
        expect(verificationResult.length).to.be.equal(1);
        // Identity with id at index 0 doesn't exist
        const recoveredDataContractBuffer = verificationResult[0];
        expect(recoveredDataContractBuffer).to.be.an.instanceof(Uint8Array);

        const recoveredDataContract = client.platform.dpp
          .dataContract.createFromBuffer(recoveredDataContractBuffer);

        // Deep equal won't work in this case, because identity returned by the register
        const actualDataContract = dataContractFixture.toJSON();
        // Because the actual identity state is before the registration, and the
        // balance wasn't added to it yet
        actualDataContract.balance = 4462;
        expect(recoveredDataContract.toJSON()).to.be.deep.equal(actualDataContract);
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

        expect(fullProof.storeTreeProofs).to.exist();

        const identitiesProofBuffer = fullProof.storeTreeProofs.getIdentitiesProof();
        expect(identitiesProofBuffer).to.be.an.instanceof(Uint8Array);
        expect(identitiesProofBuffer.length).to.be.greaterThan(0);

        expect(fullProof.signatureLLMQHash).to.be.an.instanceof(Uint8Array);
        expect(fullProof.signatureLLMQHash.length).to.be.equal(32);

        expect(fullProof.signature).to.be.an.instanceof(Uint8Array);
        expect(fullProof.signature.length).to.be.equal(96);

        // const rootTreeProof = parseRootTreeProof(fullProof.rootTreeProof);
        const parsedStoreTreeProof = parseStoreTreeProof(identitiesProofBuffer);

        const identitiesFromProof = parsedStoreTreeProof.values;

        const valueIds = identitiesFromProof.map((identityValue) => identityValue.id.toString('hex'));

        // The proof will contain left and right values to the empty place
        expect(valueIds.indexOf(fakeIdentityId.toString('hex'))).to.be.equal(-1);

        const { rootHash: identityLeafRoot } = executeProof(identitiesProofBuffer);

        const identityIdsToProve = [fakeIdentityId];

        const verificationResult = verifyProof(
          identitiesProofBuffer,
          identityIdsToProve,
          identityLeafRoot,
        );

        // We pass one key
        expect(verificationResult.length).to.be.equal(1);
        // Identity with id at index 0 doesn't exist
        expect(verificationResult[0]).to.be.null();
      });
    });
  });
});
