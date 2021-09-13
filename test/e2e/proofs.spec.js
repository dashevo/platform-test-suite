const Identifier = require('@dashevo/dpp/lib/Identifier');
const { MerkleProof, MerkleTree } = require('js-merkle');
const { executeProof } = require('@dashevo/merk');
const createClientWithoutWallet = require('../../lib/test/createClientWithoutWallet');
const hashFunction = require('../../lib/proofHashFunction');

describe('e2e', () => {
  describe('Proofs', () => {
    let blake3;
    let dashClient;

    before(async () => {
      await hashFunction.init();
      blake3 = hashFunction.hashFunction;

      dashClient = await createClientWithoutWallet();
    });

    after(() => {
      dashClient.disconnect();
    });

    it('should be correct for all endpoints', async () => {
      const dapiClient = await dashClient.getDAPIClient();
      const contractId = Identifier.from(process.env.DPNS_CONTRACT_ID);
      const identityId = Identifier.from(process.env.DPNS_TOP_LEVEL_IDENTITY_ID);
      const identity = await dashClient.platform.identities.get(identityId);

      const [
        identityResponse,
        keysResponse,
        contractsResponse,
        documentsResponse,
        identitiesByPublicKeyHashesResponse,
      ] = await Promise.all([
        dapiClient.platform.getIdentity(identityId, { prove: true }),
        dapiClient.platform.getIdentityIdsByPublicKeyHashes(
          [identity.getPublicKeyById(0).getData()], { prove: true },
        ),
        dapiClient.platform.getDataContract(contractId, { prove: true }),
        dapiClient.platform.getDocuments(contractId, 'preorder', {
          where: [['$id', '==', identityId]],
          prove: true,
        }),
        dapiClient.platform.getIdentitiesByPublicKeyHashes(
          [identity.getPublicKeyById(0).getData()], { prove: true },
        ),
      ]);

      const identityProof = MerkleProof.fromBuffer(
        identityResponse.proof.rootTreeProof, blake3,
      );
      const contractsProof = MerkleProof.fromBuffer(
        contractsResponse.proof.rootTreeProof, blake3,
      );
      const documentsProof = MerkleProof.fromBuffer(
        documentsResponse.proof.rootTreeProof, blake3,
      );
      const keysProof = MerkleProof.fromBuffer(
        keysResponse.proof.rootTreeProof, blake3,
      );
      const identitiesByPublicKeyHashesProof = MerkleProof.fromBuffer(
        identitiesByPublicKeyHashesResponse.proof.rootTreeProof, blake3,
      );

      const { rootHash: identityLeaf } = executeProof(
        identityResponse.proof.storeTreeProofs.getIdentitiesProof(),
      );
      const { rootHash: publicKeysLeaf } = executeProof(
        keysResponse.proof.storeTreeProofs.getPublicKeyHashesToIdentityIdsProof(),
      );
      const { rootHash: contractsLeaf } = executeProof(
        contractsResponse.proof.storeTreeProofs.getDataContractsProof(),
      );
      const { rootHash: documentsLeaf } = executeProof(
        documentsResponse.proof.storeTreeProofs.getDocumentsProof(),
      );

      const reconstructedLeaves = [
        identityProof.getProofHashes()[0],
        identityLeaf,
        publicKeysLeaf,
        contractsLeaf,
        documentsLeaf,
        documentsProof.getProofHashes()[0],
      ];

      const reconstructedTree = new MerkleTree(reconstructedLeaves, blake3);
      const treeLayers = reconstructedTree.getHexLayers();
      const reconstructedAppHash = Buffer.from(reconstructedTree.getRoot()).toString('hex');

      const identityProofRoot = Buffer.from(identityProof.calculateRoot([1], [identityLeaf], 6)).toString('hex');
      const keysProofRoot = Buffer.from(keysProof.calculateRoot([2], [publicKeysLeaf], 6)).toString('hex');
      const contractsProofRoot = Buffer.from(contractsProof.calculateRoot([3], [contractsLeaf], 6)).toString('hex');
      const documentsProofRoot = Buffer.from(documentsProof.calculateRoot([4], [documentsLeaf], 6)).toString('hex');
      const identitiesIdsProofRoot = Buffer.from(identitiesByPublicKeyHashesProof.calculateRoot([1, 2], [identityLeaf, publicKeysLeaf], 6)).toString('hex');

      expect(identityProof.getHexProofHashes()).to.be.deep.equal([
        treeLayers[0][0],
        treeLayers[1][1],
        treeLayers[1][2],
      ]);

      expect(keysProof.getHexProofHashes()).to.be.deep.equal([
        treeLayers[0][3],
        treeLayers[1][0],
        treeLayers[1][2],
      ]);

      expect(contractsProof.getHexProofHashes()).to.be.deep.equal([
        treeLayers[0][2],
        treeLayers[1][0],
        treeLayers[1][2],
      ]);

      expect(documentsProof.getHexProofHashes()).to.be.deep.equal([
        treeLayers[0][5],
        treeLayers[2][0],
      ]);

      expect(identitiesByPublicKeyHashesProof.getHexProofHashes()).to.be.deep.equal([
        treeLayers[0][0],
        treeLayers[0][3],
        treeLayers[1][2],
      ]);

      expect(identityProofRoot).to.be.equal(reconstructedAppHash);
      expect(keysProofRoot).to.be.equal(reconstructedAppHash);
      expect(contractsProofRoot).to.be.equal(reconstructedAppHash);
      expect(documentsProofRoot).to.be.equal(reconstructedAppHash);
      expect(identitiesIdsProofRoot).to.be.equal(reconstructedAppHash);
    });
  });
});
