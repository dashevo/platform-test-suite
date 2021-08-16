const createClientWithFundedWallet = require('../../lib/test/createClientWithFundedWallet');
const wait = require('../../lib/wait');

describe('e2e', () => {
  describe('Feature flags', function main() {
    this.timeout(600000);

    describe('updateConsensusParams', () => {
      let oldConsensusParams;
      let ownerClient;
      let updateConsensusParamsFeatureFlag;
      let identity;

      before(async () => {
        ownerClient = await createClientWithFundedWallet(
          process.env.DPNS_TOP_LEVEL_IDENTITY_PRIVATE_KEY,
        );

        const featureFlagContract = await ownerClient.platform.contracts.get(
          process.env.FEATURE_FLAGS_CONTRACT_ID,
        );

        ownerClient.getApps().set('featureFlags', {
          contractId: process.env.FEATURE_FLAGS_CONTRACT_ID,
          contract: featureFlagContract,
        });

        identity = await ownerClient.platform.identities.get(
          process.env.FEATURE_FLAGS_IDENTITY_ID,
        );

        const { blockHeight: lastBlockHeight } = identity.getMetadata();

        oldConsensusParams = await ownerClient.getDAPIClient().platform.getConsensusParams();

        const block = oldConsensusParams.getBlock();
        const evidence = oldConsensusParams.getEvidence();

        updateConsensusParamsFeatureFlag = {
          enableAtHeight: lastBlockHeight + 2,
          block: {
            maxBytes: +block.maxBytes + 1,
          },
          evidence: {
            maxAgeNumBlocks: +evidence.maxAgeNumBlocks + 1,
            maxAgeDuration: {
              seconds: Math.trunc(evidence.maxAgeDuration / 1000000000) + 1,
              nanos: (evidence.maxAgeDuration % 1000000000) + 1,
            },
            maxBytes: +evidence.maxBytes + 1,
          },
        };
      });

      it('should update consensus params', async function it() {
        if (process.env.NETWORK !== 'regtest') {
          this.skip();
        }

        const document = await ownerClient.platform.documents.create(
          'featureFlags.updateConsensusParams',
          identity,
          updateConsensusParamsFeatureFlag,
        );

        await ownerClient.platform.documents.broadcast({
          create: [document],
        }, identity);

        // wait for block
        let height;
        do {
          const someIdentity = await ownerClient.platform.identities.get(
            process.env.FEATURE_FLAGS_IDENTITY_ID,
          );

          ({ blockHeight: height } = someIdentity.getMetadata());
        } while (height <= updateConsensusParamsFeatureFlag.enableAtHeight);

        await wait(30000);

        const newConsensusParams = await ownerClient.getDAPIClient().platform.getConsensusParams();

        const { block, evidence } = updateConsensusParamsFeatureFlag;

        const updatedBlock = newConsensusParams.getBlock();

        expect(updatedBlock.getMaxBytes()).to.equal(`${block.maxBytes}`);

        const { seconds } = evidence.maxAgeDuration;
        const nanos = `${evidence.maxAgeDuration.nanos}`.padStart(9, '0');

        const updatedEvidence = newConsensusParams.getEvidence();

        expect(updatedEvidence.getMaxAgeNumBlocks()).to.equal(`${evidence.maxAgeNumBlocks}`);
        expect(updatedEvidence.getMaxAgeDuration()).to.equal(`${seconds}${nanos}`);
        expect(updatedEvidence.getMaxBytes()).to.equal(`${evidence.maxBytes}`);
      });
    });
  });
});
