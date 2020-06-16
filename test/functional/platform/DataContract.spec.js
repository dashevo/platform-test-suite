const DashPlatformProtocol = require('@dashevo/dpp');

const GrpcErrorCodes = require('@dashevo/grpc-common/lib/server/error/GrpcErrorCodes');

const getDataContractFixture = require(
  '@dashevo/dpp/lib/test/fixtures/getDataContractFixture',
);

const getClientWithFundedWallet = require('../../../lib/test/getClientWithFundedWallet');

describe('Platform', function platform() {
  this.timeout(950000);

  let client;
  let walletAccount;
  let dpp;
  let dataContractFixture;
  let publicKeyId;
  let identity;

  before(async () => {
    publicKeyId = 0;
    dpp = new DashPlatformProtocol();

    client = await getClientWithFundedWallet();
    walletAccount = await client.getWalletAccount();

    identity = await client.platform.identities.register(1);
  });

  after(async () => {
    if (client) {
      await client.disconnect();
    }
  });

  describe('Data contract', () => {
    it('should fail to create new data contract with unknown owner', async () => {
      // if no identity is specified
      // random is generated within the function
      dataContractFixture = getDataContractFixture();

      try {
        await client.platform.contracts.broadcast(dataContractFixture, identity);

        expect.fail('should throw invalid argument error');
      } catch (e) {
        const [error] = JSON.parse(e.message.replace('StateTransition is invalid - ', ''));
        expect(error.name).to.equal('IdentityNotFoundError');
      }
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
  });
});
