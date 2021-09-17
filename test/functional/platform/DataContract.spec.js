const getDataContractFixture = require(
  '@dashevo/dpp/lib/test/fixtures/getDataContractFixture',
);

const { executeProof, verifyProof } = require('@dashevo/merk');
const generateRandomIdentifier = require('@dashevo/dpp/lib/test/utils/generateRandomIdentifier');
const IdentityNotFoundError = require('@dashevo/dpp/lib/errors/consensus/signature/IdentityNotFoundError');
const { StateTransitionBroadcastError } = require('dash/build/src/errors/StateTransitionBroadcastError');
const createClientWithFundedWallet = require('../../../lib/test/createClientWithFundedWallet');
const testProofStructure = require('../../../lib/test/testProofStructure');
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

      expect(broadcastError).to.be.an.instanceOf(StateTransitionBroadcastError);
      expect(broadcastError.getCause()).to.be.an.instanceOf(IdentityNotFoundError);
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
      it('should be able to get and verify proof that data contract exists with getIdentity', async () => {
        const dataContractId = dataContractFixture.getId();

        const dataContractWithProof = await client.getDAPIClient().platform.getDataContract(
          dataContractId, { prove: true },
        );

        const fullProof = dataContractWithProof.proof;

        testProofStructure(expect, fullProof);

        const dataContractsProofBuffer = fullProof.storeTreeProofs.getDataContractsProof();

        const parsedStoreTreeProof = parseStoreTreeProof(dataContractsProofBuffer);

        expect(parsedStoreTreeProof.values.length).to.be.equal(1);

        const restoredDataContract = await client.platform.dpp
          .dataContract.createFromBuffer(parsedStoreTreeProof.values[0]);

        expect(restoredDataContract.toJSON()).to.be.deep.equal(dataContractFixture.toJSON());

        const { rootHash: dataContractsLeafRoot } = executeProof(dataContractsProofBuffer);

        const verificationResult = verifyProof(
          dataContractsProofBuffer,
          [dataContractId],
          dataContractsLeafRoot,
        );

        // We pass one key
        expect(verificationResult.length).to.be.equal(1);

        const recoveredDataContractBuffer = verificationResult[0];
        expect(recoveredDataContractBuffer).to.be.an.instanceof(Uint8Array);

        const recoveredDataContract = await client.platform.dpp
          .dataContract.createFromBuffer(recoveredDataContractBuffer);

        expect(recoveredDataContract.toJSON()).to.be.deep.equal(dataContractFixture.toJSON());
      });

      it('should be able to verify proof that data contract does not exist', async () => {
        // The same as above, but for an identity id that doesn't exist

        const dataContractId = generateRandomIdentifier();

        const dataContractWithProof = await client.getDAPIClient().platform.getDataContract(
          dataContractId, { prove: true },
        );

        const fullProof = dataContractWithProof.proof;

        testProofStructure(expect, fullProof);

        const dataContractsProofBuffer = fullProof.storeTreeProofs.getDataContractsProof();

        const { rootHash: dataContractsLeafRoot } = executeProof(dataContractsProofBuffer);

        const verificationResult = verifyProof(
          dataContractsProofBuffer,
          [dataContractId],
          dataContractsLeafRoot,
        );

        // We pass one key
        expect(verificationResult.length).to.be.equal(1);
        // Data contract doesn't exist, so result is null
        expect(verificationResult[0]).to.be.null();
      });
    });
  });
});
