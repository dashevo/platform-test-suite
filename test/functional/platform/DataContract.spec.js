const {
  PrivateKey,
  PublicKey,
  Transaction,
} = require('@dashevo/dashcore-lib');

const Dash = require('dash');
const DAPIClient = require('@dashevo/dapi-client');
const DashPlatformProtocol = require('@dashevo/dpp');


const Identity = require('@dashevo/dpp/lib/identity/Identity');

const getDataContractFixture = require(
  '@dashevo/dpp/lib/test/fixtures/getDataContractFixture',
);

const fundAddress = require('../../../lib/test/fundAddress');

const wait = require('../../../lib/wait');

describe('Platform', function platform() {
  this.timeout(950000);

  let dapiClient;
  let dpp;
  let identityPrivateKey;
  let identityAddress;
  let dataContract;
  let publicKeyId;

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
      addresses: ['127.0.0.1'],
      // timeout: 10000,
      // addresses: seeds.map(({ service }) => (
      //   {
      //     host: service.split(':')[0],
      //     httpPort: service.split(':')[1],
      //     grpcPort: 3010,
      //   }
      // )),
      // network: 'local',
    });

    await dapiClient.core.generateToAddress(10, faucetAddress);

    identityPrivateKey = new PrivateKey();
    const identityPublicKey = new PublicKey({
      ...identityPrivateKey.toPublicKey().toObject(),
      compressed: true,
    });
    identityAddress = identityPrivateKey
      .toAddress(process.env.NETWORK);

    await fundAddress(dapiClient, faucetAddress, faucetPrivateKey, identityAddress, 10);

    const privateKey = new PrivateKey(faucetPrivateKey);

    publicKeyId = 0;

    dpp = new DashPlatformProtocol({
      dataProvider: {},
    });

    const amount = 10000;

    const { blocks } = await dapiClient.core.getStatus();
    const { items: utxos } = await dapiClient.core.getUTXO(faucetAddress);

    const sortedUtxos = utxos
      .filter((utxo) => utxo.height < blocks - 100)
      .sort((a, b) => a.satoshis > b.satoshis);

    const inputs = [];
    let sum = 0;
    let i = 0;

    do {
      const input = sortedUtxos[i];
      inputs.push(input);
      sum += input.satoshis;

      ++i;
    } while (sum < amount && i < sortedUtxos.length);

    const transaction = new Transaction();

    transaction.from(inputs.slice(-1)[0])
      .addBurnOutput(amount, identityPublicKey.hash)
      .change(faucetAddress)
      .fee(668)
      .sign(privateKey);

    await dapiClient.core.broadcastTransaction(transaction.toBuffer());

    await dapiClient.core.generateToAddress(1, faucetAddress);
    // await wait(2000); // wait a couple of seconds for tx to be confirmed

    const outPoint = transaction.getOutPointBuffer(0);

    const identity = dpp.identity.create(
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
    // Create Data Contract
    await dapiClient.platform.broadcastStateTransition(dataContractCreateTransition.serialize());
  });

  describe('Data contract', () => {
    it('should fail to create new data contract with invalid data');
    it('should fail to create new data contract with unknown owner');
    it('should create new data contract with previously created identity as an owner');
    it('should be able to get newly created data contract', async () => {
      const serializedDataContract = await dapiClient.platform.getDataContract(
        dataContract.getId(),
      );

      expect(serializedDataContract).to.be.not.null();

      const receivedDataContract = await dpp.dataContract.createFromSerialized(
        serializedDataContract,
        { skipValidation: true },
      );

      expect(dataContract.toJSON()).to.deep.equal(receivedDataContract.toJSON());
    });
  });
});
