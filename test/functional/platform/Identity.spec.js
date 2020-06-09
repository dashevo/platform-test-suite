const {
  PrivateKey,
  PublicKey,
  Transaction,
} = require('@dashevo/dashcore-lib');

const DashPlatformProtocol = require('@dashevo/dpp');
const getDataContractFixture = require('@dashevo/dpp/lib/test/fixtures/getDataContractFixture')

const DAPIClient = require('@dashevo/dapi-client');

const fundAddress = require('../../../lib/test/fundAddress');

describe('Platform', function platform() {
  this.timeout(950000);

  let dpp;
  let dapiClient;

  let identityPrivateKey;
  let identityPublicKey;
  let identityAddress;

  let identityCreateTransition;
  let identity;

  before(async () => {
    dpp = new DashPlatformProtocol();

    const seeds = process.env.DAPI_SEED
      .split(',')
      .map((seed) => ({ service: `${seed}` }));

    // Prepare to fund Bob and Alice wallets
    const faucetPrivateKey = PrivateKey.fromString(process.env.FAUCET_PRIVATE_KEY);
    const faucetAddress = faucetPrivateKey
      .toAddress(process.env.NETWORK)
      .toString();

    dapiClient = new DAPIClient({
      addresses: seeds.map(({ service }) => (
        {
          host: service.split(':')[0],
          httpPort: service.split(':')[1],
          grpcPort: 3010,
        }
      )),
      timeout: 10000,
    });

    await dapiClient.core.generateToAddress(10, faucetAddress);

    identityPrivateKey = new PrivateKey();
    identityPublicKey = new PublicKey({
      ...identityPrivateKey.toPublicKey().toObject(),
      compressed: true,
    });
    identityAddress = identityPrivateKey
      .toAddress(process.env.NETWORK)
      .toString();

    await dapiClient.core.generateToAddress(150, identityAddress);

    await fundAddress(dapiClient, faucetAddress, faucetPrivateKey, identityAddress, 3);
  });

  describe('Identity', () => {
    it('should fail to create an identity if outpoint was not found', async () => {
      identity = dpp.identity.create(
        Buffer.alloc(36),
        [identityPublicKey],
      );

      identityCreateTransition = dpp.identity.createIdentityCreateTransition(identity);
      identityCreateTransition.signByPrivateKey(identityPrivateKey);

      try {
        await dapiClient.platform.broadcastStateTransition(identityCreateTransition.serialize());
        expect.fail('Error was not thrown');
      } catch (e) {
        const [error] = JSON.parse(e.metadata.get('errors'));
        expect(error.name).to.equal('IdentityAssetLockTransactionNotFoundError');
      }
    });

    it('should create an identity', async () => {
      const { blocks } = await dapiClient.core.getStatus();
      const { items: utxos } = await dapiClient.core.getUTXO(identityAddress);

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
      } while (sum < 1 && i < sortedUtxos.length);

      const outPointTx = new Transaction();

      outPointTx.from(inputs)
        .addBurnOutput(1, identityPublicKey.hash)
        .change(identityAddress)
        .fee(668)
        .sign(identityPrivateKey);

      await dapiClient.core.broadcastTransaction(outPointTx.toBuffer());
      await dapiClient.core.generateToAddress(1, identityAddress);

      const outPoint = outPointTx.getOutPointBuffer(0);

      identity = dpp.identity.create(
        outPoint,
        [identityPublicKey],
      );

      identityCreateTransition = dpp.identity.createIdentityCreateTransition(identity);
      identityCreateTransition.signByPrivateKey(identityPrivateKey);

      await dapiClient.platform.broadcastStateTransition(identityCreateTransition.serialize());
    });

    it('should fail to create an identity with the same first public key', async () => {
      const { blocks } = await dapiClient.core.getStatus();
      const { items: utxos } = await dapiClient.core.getUTXO(identityAddress);

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
      } while (sum < 1 && i < sortedUtxos.length);

      const outPointTx = new Transaction();

      outPointTx.from(inputs)
        .addBurnOutput(1, identityPublicKey.hash)
        .change(identityAddress)
        .fee(668)
        .sign(identityPrivateKey);

      const outPoint = outPointTx.getOutPointBuffer(0);

      await dapiClient.core.broadcastTransaction(outPointTx.toBuffer());
      await dapiClient.core.generateToAddress(1, identityAddress);

      const otherIdentity = dpp.identity.create(
        outPoint,
        [identityPublicKey],
      );

      const otherIdentityCreateTransition = dpp.identity.createIdentityCreateTransition(otherIdentity);
      otherIdentityCreateTransition.signByPrivateKey(identityPrivateKey);

      try {
        await dapiClient.platform.broadcastStateTransition(otherIdentityCreateTransition.serialize());
      } catch (e) {
        const [error] = JSON.parse(e.metadata.get('errors'));
        expect(error.name).to.equal('IdentityFirstPublicKeyAlreadyExistsError');
        expect(error.publicKeyHash).to.equal(identityPublicKey.hash.toString('hex'));
      }
    });

    it('should be able to get newly created identity', async () => {
      const serializedIdentity = await dapiClient.platform.getIdentity(
        identityCreateTransition.getIdentityId(),
      );

      expect(serializedIdentity).to.be.not.null();

      const receivedIdentity = dpp.identity.createFromSerialized(
        serializedIdentity,
        { skipValidation: true },
      )

      expect(receivedIdentity.toJSON()).to.deep.equal({
        ...identity.toJSON(),
        balance: 826,
      });

      // updating balance
      identity.setBalance(receivedIdentity.getBalance());
    });

    it('should be able to get newly created identity by it\'s first public key', async () => {
      const serializedIdentity = await dapiClient.platform.getIdentityByFirstPublicKey(
        identityPublicKey.hash,
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
      const identityId = await dapiClient.platform.getIdentityIdByFirstPublicKey(
        identityPublicKey.hash,
      );

      expect(identityId).to.be.not.null();
      expect(identityId).to.equal(identity.getId());
    });

    describe('Credits', () => {
      let dataContract;

      before(async () => {
        dataContract = getDataContractFixture(identity.getId());
        const dataContractStateTransition = dpp.dataContract.createStateTransition(
          dataContract,
        );
        dataContractStateTransition.sign(identity.getPublicKeyById(0), identityPrivateKey);

        // locally figure out current balance
        // of the identity
        identity.setBalance(
          identity.getBalance() - dataContractStateTransition.calculateFee(),
        );

        await dapiClient.platform.broadcastStateTransition(dataContractStateTransition.serialize());
      });

      it('should fail to create more documents if there are no more credits', async () => {
        const document = dpp.document.create(dataContract, identity.getId(), 'niceDocument', {
          name: 'Some Very Long Long Long Name',
        });

        const documentsStateTransition = dpp.document.createStateTransition({
          create: [document],
        });
        documentsStateTransition.sign(identity.getPublicKeyById(0), identityPrivateKey);

        try {
          await dapiClient.platform.broadcastStateTransition(documentsStateTransition.serialize());
        } catch (e) {
          expect(e.details).to.equal('Failed precondition: Not enough credits');
        }
      });

      it('should fail top-up if transaction has not been sent', async () => {
        const { blocks } = await dapiClient.core.getStatus();
        const { items: utxos } = await dapiClient.core.getUTXO(identityAddress);

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
        } while (sum < 1 && i < sortedUtxos.length);

        const outPointTx = new Transaction();

        outPointTx.from(inputs)
          .addBurnOutput(1, identityPublicKey.hash)
          .change(identityAddress)
          .fee(668)
          .sign(identityPrivateKey);

        const outPoint = outPointTx.getOutPointBuffer(0);

        const identityTopUpTransition = dpp.identity.createIdentityTopUpTransition(
          identity.getId(),
          outPoint,
        );
        identityTopUpTransition.signByPrivateKey(identityPrivateKey);

        try {
          await dapiClient.platform.broadcastStateTransition(identityTopUpTransition.serialize());
        } catch (e) {
          const [error] = JSON.parse(e.metadata.get('errors'));
          expect(error.name).to.equal('IdentityAssetLockTransactionNotFoundError');
        }
      });

      it('should be able to top-up credit balance', async () => {
        const { blocks } = await dapiClient.core.getStatus();
        const { items: utxos } = await dapiClient.core.getUTXO(identityAddress);

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
        } while (sum < 1 && i < sortedUtxos.length);

        const outPointTx = new Transaction();

        outPointTx.from(inputs)
          .addBurnOutput(1, identityPublicKey.hash)
          .change(identityAddress)
          .fee(668)
          .sign(identityPrivateKey);

        const outPoint = outPointTx.getOutPointBuffer(0);

        const identityTopUpTransition = dpp.identity.createIdentityTopUpTransition(
          identity.getId(),
          outPoint,
        );
        identityTopUpTransition.signByPrivateKey(identityPrivateKey);

        await dapiClient.core.broadcastTransaction(outPointTx.toBuffer());
        await dapiClient.core.generateToAddress(1, identityAddress);

        await dapiClient.platform.broadcastStateTransition(identityTopUpTransition.serialize());
      });

      it('should be able to create more documents after the top-up', async () => {
        const document = dpp.document.create(dataContract, identity.getId(), 'niceDocument', {
          name: 'Some Very Long Long Long Name',
        });

        const documentsStateTransition = dpp.document.createStateTransition({
          create: [document],
        });
        documentsStateTransition.sign(identity.getPublicKeyById(0), identityPrivateKey);

        await dapiClient.platform.broadcastStateTransition(documentsStateTransition.serialize());
      });
    });
  });
});
