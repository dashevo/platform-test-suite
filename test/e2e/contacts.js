const DAPIClient = require('@dashevo/dapi-client');

const {
  Transaction,
  PrivateKey,
  PublicKey,
  Address,
} = require('@dashevo/dashcore-lib');

const Schema = require('@dashevo/dash-schema/dash-schema-lib');
const DashPay = require('@dashevo/dash-schema/dash-core-daps');

const doubleSha256 = require('../../lib/doubleSha256');
const wait = require('../../lib/wait');

describe('Contacts app', () => {
  const timeout = 1000;
  const attempts = 300;

  let dapiClient;
  let dapId;
  let dapSchema;
  let dapContract;

  let faucetPrivateKey;
  let faucetPublicKey;
  let faucetAddress;

  let bobPrivateKey;
  let bobUserName;
  let bobRegTxId;
  let alicePrivateKey;
  let aliceUserName;
  let aliceRegTxId;

  let contactsTransactionId;
  let bobProfileTransactionId;
  let aliceProfileTransactionId;

  before(() => {
    const seeds = process.env.DAPI_CLIENT_SEEDS
      .split(',')
      .map(ip => ({ ip }));

    dapiClient = new DAPIClient({
      seeds,
      port: process.env.DAPI_CLIENT_PORT,
    });

    faucetPrivateKey = new PrivateKey(process.env.FAUCET_PRIVATE_KEY);
    faucetPublicKey = PublicKey.fromPrivateKey(faucetPrivateKey);
    faucetAddress = Address
      .fromPublicKey(faucetPublicKey, process.env.NETWORK === 'devnet' ? 'testnet' : process.env.NETWORK)
      .toString();

    bobUserName = Math.random().toString(36).substring(7);
    aliceUserName = Math.random().toString(36).substring(7);
    dapSchema = Object.assign({}, DashPay);
    dapSchema.title = `TestContacts_${bobUserName}`;

    dapContract = Schema.create.dapcontract(dapSchema);
    dapId = doubleSha256(Schema.serialize.encode(dapContract.dapcontract));
  });

  describe('Bob', () => {
    it('should register blockchain user', async function it() {
      this.timeout(50000);

      bobPrivateKey = new PrivateKey();
      const validPayload = new Transaction.Payload.SubTxRegisterPayload()
        .setUserName(bobUserName)
        .setPubKeyIdFromPrivateKey(bobPrivateKey).sign(bobPrivateKey);

      const inputs = await dapiClient.getUTXO(faucetAddress);

      const transaction = Transaction()
        .setType(Transaction.TYPES.TRANSACTION_SUBTX_REGISTER)
        .setExtraPayload(validPayload)
        .from(inputs.slice(-1)[0])
        .addFundingOutput(10000)
        .change(faucetAddress)
        .sign(faucetPrivateKey);

      ({ txid: bobRegTxId } = await dapiClient.sendRawTransaction(transaction.serialize()));

      await wait(5000); // await dapiClient.generate(1);

      const userByName = await dapiClient.getUserByName(bobUserName);
      expect(userByName.uname).to.be.equal(bobUserName);
    });

    it('should publish "Contacts" contract', async function it() {
      this.timeout(360000);

      // 1. Create ST packet
      let { stpacket: stPacket } = Schema.create.stpacket();
      stPacket = Object.assign(stPacket, dapContract);

      // 2. Create State Transition
      const transaction = new Transaction()
        .setType(Transaction.TYPES.TRANSACTION_SUBTX_TRANSITION);

      const serializedPacket = Schema.serialize.encode(stPacket);
      const stPacketHash = doubleSha256(serializedPacket);

      transaction.extraPayload
        .setRegTxId(bobRegTxId)
        .setHashPrevSubTx(bobRegTxId)
        .setHashSTPacket(stPacketHash)
        .setCreditFee(1000)
        .sign(bobPrivateKey);

      contactsTransactionId = await dapiClient.sendRawTransition(
        transaction.serialize(),
        serializedPacket.toString('hex'),
      );

      expect(contactsTransactionId).to.be.a('string');
      expect(contactsTransactionId).to.be.not.empty();

      // 5. Mine transaction and Wait until Drive synced this block
      let dapContractFromDAPI;

      for (let i = 0; i <= attempts; i++) {
        try {
          dapContractFromDAPI = await dapiClient.fetchDapContract(dapId);
          break;
        } catch (e) {
          await wait(timeout);
        }
      }

      expect(dapContractFromDAPI).to.have.property('dapName');
      expect(dapContractFromDAPI.dapName).to.be.equal(dapSchema.title);
    });

    it('should create profile in "Contacts" app', async function it() {
      this.timeout(320000);

      const userRequest = Schema.create.dapobject('user');
      userRequest.aboutme = 'This is story about me';
      userRequest.avatar = 'My avatar here';
      userRequest.act = 0;

      // 1. Create ST user packet
      const { stpacket: stPacket } = Schema.create.stpacket();
      stPacket.dapobjects = [userRequest];
      stPacket.dapid = dapId;

      // 2. Create State Transition
      const transaction = new Transaction()
        .setType(Transaction.TYPES.TRANSACTION_SUBTX_TRANSITION);

      const serializedPacket = Schema.serialize.encode(stPacket);
      const stPacketHash = doubleSha256(serializedPacket);

      transaction.extraPayload
        .setRegTxId(bobRegTxId)
        .setHashPrevSubTx(contactsTransactionId)
        .setHashSTPacket(stPacketHash)
        .setCreditFee(1000)
        .sign(bobPrivateKey);

      bobProfileTransactionId = await dapiClient.sendRawTransition(
        transaction.serialize(),
        serializedPacket.toString('hex'),
      );
      expect(bobProfileTransactionId).to.be.a('string');
      expect(bobProfileTransactionId).to.be.not.empty();

      let bobSpace;
      for (let i = 0; i <= attempts; i++) {
        bobSpace = await dapiClient.fetchDapObjects(dapId, 'user', {});
        if (bobSpace.length > 0) {
          break;
        } else {
          await wait(timeout);
        }
      }

      expect(bobSpace).to.have.lengthOf(1);
      expect(bobSpace[0].blockchainUserId).to.be.equal(bobRegTxId);
      expect(bobSpace[0].object).to.be.deep.equal(
        {
          act: 0,
          idx: 0,
          rev: 0,
          avatar: 'My avatar here',
          aboutme: 'This is story about me',
          objtype: 'user',
        },
      );
    });
  });

  describe('Alice', () => {
    it('should register blockchain user', async function it() {
      this.timeout(50000);

      alicePrivateKey = new PrivateKey();
      const validPayload = new Transaction.Payload.SubTxRegisterPayload()
        .setUserName(aliceUserName)
        .setPubKeyIdFromPrivateKey(alicePrivateKey).sign(alicePrivateKey);

      const inputs = await dapiClient.getUTXO(faucetAddress);

      const transaction = Transaction()
        .setType(Transaction.TYPES.TRANSACTION_SUBTX_REGISTER)
        .setExtraPayload(validPayload)
        .from(inputs.slice(-1)[0])
        .addFundingOutput(10000)
        .change(faucetAddress)
        .sign(faucetPrivateKey);

      ({ txid: aliceRegTxId } = await dapiClient.sendRawTransaction(transaction.serialize()));

      // await dapiClient.generate(1);
      await wait(5000);

      const userByName = await dapiClient.getUserByName(aliceUserName);
      expect(userByName.uname).to.be.equal(aliceUserName);
    });

    it('should create profile in "Contacts" app', async function it() {
      this.timeout(320000);

      const userRequest = Schema.create.dapobject('user');
      userRequest.aboutme = 'I am Alice';
      userRequest.avatar = 'Alice\'s avatar here';
      userRequest.act = 0;

      // 1. Create ST user packet
      const { stpacket: stPacket } = Schema.create.stpacket();
      stPacket.dapobjects = [userRequest];
      stPacket.dapid = dapId;

      // 2. Create State Transition
      const transaction = new Transaction()
        .setType(Transaction.TYPES.TRANSACTION_SUBTX_TRANSITION);

      const serializedPacket = Schema.serialize.encode(stPacket);
      const stPacketHash = doubleSha256(serializedPacket);

      transaction.extraPayload
        .setRegTxId(aliceRegTxId)
        .setHashPrevSubTx(aliceRegTxId)
        .setHashSTPacket(stPacketHash)
        .setCreditFee(1000)
        .sign(alicePrivateKey);

      aliceProfileTransactionId = await dapiClient.sendRawTransition(
        transaction.serialize(),
        serializedPacket.toString('hex'),
      );
      expect(aliceProfileTransactionId).to.be.a('string');
      expect(aliceProfileTransactionId).to.be.not.empty();

      let aliceSpace;
      for (let i = 0; i <= attempts; i++) {
        aliceSpace = await dapiClient.fetchDapObjects(dapId, 'user', {});
        if (aliceSpace.length > 1) {
          break;
        } else {
          await wait(timeout);
        }
      }
      expect(aliceSpace).to.have.lengthOf(2);
      expect(aliceSpace[1].blockchainUserId).to.be.equal(aliceRegTxId);
      expect(aliceSpace[1].object).to.be.deep.equal(
        {
          act: 0,
          idx: 0,
          rev: 0,
          avatar: 'Alice\'s avatar here',
          aboutme: 'I am Alice',
          objtype: 'user',
        },
      );
    });

    it('should update only her profile', async function it() {
      this.timeout(320000);

      const userRequest = Schema.create.dapobject('user');
      userRequest.aboutme = 'I am Alice2';
      userRequest.avatar = 'Alice\'s avatar here2';
      // userRequest.act = 0;

      // 1. Create ST user packet
      const { stpacket: stPacket } = Schema.create.stpacket();
      stPacket.dapobjects = [userRequest];
      stPacket.dapid = dapId;


      // 2. Create State Transition
      const transaction = new Transaction()
        .setType(Transaction.TYPES.TRANSACTION_SUBTX_TRANSITION);

      const serializedPacket = Schema.serialize.encode(stPacket);
      const stPacketHash = doubleSha256(serializedPacket);

      transaction.extraPayload
        .setRegTxId(aliceRegTxId)
        .setHashPrevSubTx(aliceProfileTransactionId)
        .setHashSTPacket(stPacketHash)
        .setCreditFee(1000)
        .sign(alicePrivateKey);

      const aliceUpdateProfileTransactionId = await dapiClient.sendRawTransition(
        transaction.serialize(),
        serializedPacket.toString('hex'),
      );
      expect(aliceUpdateProfileTransactionId).to.be.a('string');
      expect(aliceUpdateProfileTransactionId).to.be.not.empty();

      let aliceSpace;
      for (let i = 0; i <= attempts; i++) {
        aliceSpace = await dapiClient.fetchDapObjects(dapId, 'user', {});
        if (aliceSpace.length === 2 && aliceSpace[1].object.act === 1) {
          break;
        } else {
          await wait(timeout);
        }
      }
      expect(aliceSpace).to.have.lengthOf(2);
      expect(aliceSpace[1].blockchainUserId).to.be.equal(aliceRegTxId);
      expect(aliceSpace[1].object).to.be.deep.equal(
        {
          act: 0,
          idx: 0,
          rev: 0,
          avatar: 'Alice\'s avatar here2',
          aboutme: 'I am Alice2',
          objtype: 'user',
        },
      );
    });
  });

  xdescribe('Bob', () => {
    it('should be able to send contact request', async () => {
      const bobContactRequest = Schema.create.dapobject('contact');
      bobContactRequest.hdextpubkey = bobPrivateKey.toPublicKey().toString('hex');
      bobContactRequest.relation = aliceRegTxId;

      const dashPayContract = await dapiClient.fetchDapContract(dapId);

      // 1. Create ST contact request packet
      const tsp = Schema.create.stpacket();
      tsp.stpacket.dapobjects = [bobContactRequest];
      Schema.object.setID(tsp, dashPayContract.schema);
      tsp.stPacket = Object.assign(tsp.stpacket, dapContract);

      // 2. Create State Transition
      const transaction = new Transaction()
        .setType(Transaction.TYPES.TRANSACTION_SUBTX_TRANSITION);

      const serializedPacket = Schema.serialize.encode(tsp);
      const stPacketHash = doubleSha256(serializedPacket);

      transaction.extraPayload
        .setRegTxId(bobRegTxId)
        .setHashPrevSubTx(bobProfileTransactionId)
        .setHashSTPacket(stPacketHash)
        .setCreditFee(1000)
        .sign(bobPrivateKey);

      const bobContactRequestTransactionId = await dapiClient.sendRawTransition(
        transaction.serialize(),
        serializedPacket.toString('hex'),
      );
      expect(bobContactRequestTransactionId).to.be.a('string');
      expect(bobContactRequestTransactionId).to.be.not.empty();

      let bobContract;
      for (let i = 0; i <= attempts; i++) {
        bobContract = await dapiClient.fetchDapObjects(dapId, 'contract', {});
        if (bobContract) {
          await wait(timeout);
        } else {
          break;
        }
      }
      expect(bobContract.dapid).to.be.deep.equal(dapId);
      // TODO: check profile
    });
  });

  xdescribe('Alice', () => {
    it('should be able to approve contact request', async () => {

    });
    it('should be able to remove only here contact object', async () => {

    });
  });
});
