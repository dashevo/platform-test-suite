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
  const attempts = 400;
  const testTimeout = 500000;

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

  let bobProfileTransactionId;
  let aliceProfileTransactionId;
  let bobContactRequestTransactionId;
  let aliceUpdateProfileTransactionId;
  let aliceContactAcceptTransactionId;

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
    let contactsTransactionId;

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

      // await dapiClient.generate(1);
      await wait(5000);

      const userByName = await dapiClient.getUserByName(bobUserName);
      expect(userByName.uname).to.be.equal(bobUserName);
    });

    it('should publish "Contacts" contract', async function it() {
      this.timeout(testTimeout);

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

      let dapContractFromDAPI;

      for (let i = 0; i <= attempts; i++) {
        try {
          // waiting for Contacts to be added
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
      this.timeout(testTimeout);

      const userRequest = Schema.create.dapobject('user');
      userRequest.aboutme = 'This is story about me';
      userRequest.avatar = 'My avatar here';
      userRequest.act = 0;

      // 1. Create ST profile packet
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
        // waiting for Bob's profile to be added
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
      this.timeout(testTimeout);

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
        // waiting for Alice's profile to be added
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

    it('should be able to update her profile', async function it() {
      this.timeout(testTimeout);

      const userRequest = Schema.create.dapobject('user');
      userRequest.aboutme = 'I am Alice2';
      userRequest.avatar = 'Alice\'s avatar here2';

      // 1. Create ST update profile packet
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

      aliceUpdateProfileTransactionId = await dapiClient.sendRawTransition(
        transaction.serialize(),
        serializedPacket.toString('hex'),
      );

      expect(aliceUpdateProfileTransactionId).to.be.a('string');
      expect(aliceUpdateProfileTransactionId).to.be.not.empty();

      let aliceSpace;
      for (let i = 0; i <= attempts; i++) {
        aliceSpace = await dapiClient.fetchDapObjects(dapId, 'user', {});
        // waiting for Alice's profile modified
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
          act: 1,
          idx: 0,
          rev: 0,
          avatar: 'Alice\'s avatar here2',
          aboutme: 'I am Alice2',
          objtype: 'user',
        },
      );
    });
  });

  describe('Bob', () => {
    it('should be able to send contact request', async function it() {
      this.timeout(testTimeout);

      const bobContactRequest = Schema.create.dapobject('contact');
      bobContactRequest.hdextpubkey = bobPrivateKey.toPublicKey().toString('hex');
      bobContactRequest.relation = aliceRegTxId;
      bobContactRequest.act = 0;

      // 1. Create ST contact request packet
      const { stpacket: stPacket } = Schema.create.stpacket();
      stPacket.dapobjects = [bobContactRequest];
      stPacket.dapid = dapId;

      // 2. Create State Transition
      const transaction = new Transaction()
        .setType(Transaction.TYPES.TRANSACTION_SUBTX_TRANSITION);

      const serializedPacket = Schema.serialize.encode(stPacket);
      const stPacketHash = doubleSha256(serializedPacket);

      transaction.extraPayload
        .setRegTxId(bobRegTxId)
        .setHashPrevSubTx(bobProfileTransactionId)
        .setHashSTPacket(stPacketHash)
        .setCreditFee(1000)
        .sign(bobPrivateKey);

      bobContactRequestTransactionId = await dapiClient.sendRawTransition(
        transaction.serialize(),
        serializedPacket.toString('hex'),
      );

      expect(bobContactRequestTransactionId).to.be.a('string');
      expect(bobContactRequestTransactionId).to.be.not.empty();

      let bobContact;
      for (let i = 0; i <= attempts; i++) {
        bobContact = await dapiClient.fetchDapObjects(dapId, 'contact', {});
        // waiting for Bob's contact request to be added
        if (bobContact.length > 0) {
          break;
        } else {
          await wait(timeout);
        }
      }

      expect(bobContact).to.have.lengthOf(1);
      expect(bobContact[0].blockchainUserId).to.be.equal(bobRegTxId);
      expect(bobContact[0].object).to.be.deep.equal(
        {
          act: 0,
          idx: 0,
          rev: 0,
          objtype: 'contact',
          relation: aliceRegTxId,
          hdextpubkey: bobContactRequest.hdextpubkey,
        },
      );
    });
  });

  describe('Alice', () => {
    it('should be able to approve contact request', async function it() {
      this.timeout(testTimeout);

      const contactAcceptance = Schema.create.dapobject('contact');
      contactAcceptance.hdextpubkey = alicePrivateKey.toPublicKey().toString('hex');
      contactAcceptance.relation = bobRegTxId;

      // 1. Create ST approve contact packet
      const { stpacket: stPacket } = Schema.create.stpacket();
      stPacket.dapobjects = [contactAcceptance];
      stPacket.dapid = dapId;

      // 2. Create State Transition
      const transaction = new Transaction()
        .setType(Transaction.TYPES.TRANSACTION_SUBTX_TRANSITION);

      const serializedPacket = Schema.serialize.encode(stPacket);
      const stPacketHash = doubleSha256(serializedPacket);

      transaction.extraPayload
        .setRegTxId(aliceRegTxId)
        .setHashPrevSubTx(aliceUpdateProfileTransactionId)
        .setHashSTPacket(stPacketHash)
        .setCreditFee(1000)
        .sign(alicePrivateKey);

      aliceContactAcceptTransactionId = await dapiClient.sendRawTransition(
        transaction.serialize(),
        serializedPacket.toString('hex'),
      );

      expect(aliceContactAcceptTransactionId).to.be.a('string');
      expect(aliceContactAcceptTransactionId).to.be.not.empty();

      let aliceContact;
      for (let i = 0; i <= attempts; i++) {
        aliceContact = await dapiClient.fetchDapObjects(dapId, 'contact', {});
        // waiting for Bob's contact to be approved from Alice
        if (aliceContact.length > 1) {
          break;
        } else {
          await wait(timeout);
        }
      }

      expect(aliceContact).to.have.lengthOf(2);
      expect(aliceContact[0].blockchainUserId).to.be.equal(bobRegTxId);
      expect(aliceContact[1].blockchainUserId).to.be.equal(aliceRegTxId);
      expect(aliceContact[1].object).to.be.deep.equal(
        {
          act: 1,
          idx: 0,
          rev: 0,
          objtype: 'contact',
          relation: bobRegTxId,
          hdextpubkey: contactAcceptance.hdextpubkey,
        },
      );
    });

    it('should be able to remove contact approvement', async function it() {
      this.timeout(testTimeout);

      const contactDeleteRequest = Schema.create.dapobject('contact');
      contactDeleteRequest.hdextpubkey = alicePrivateKey.toPublicKey().toString('hex');
      contactDeleteRequest.relation = bobRegTxId;
      contactDeleteRequest.act = 2;

      // 1. Create ST contact delete packet
      const { stpacket: stPacket } = Schema.create.stpacket();
      stPacket.dapobjects = [contactDeleteRequest];
      stPacket.dapid = dapId;

      // 2. Create State Transition
      const transaction = new Transaction()
        .setType(Transaction.TYPES.TRANSACTION_SUBTX_TRANSITION);

      const serializedPacket = Schema.serialize.encode(stPacket);
      const stPacketHash = doubleSha256(serializedPacket);

      transaction.extraPayload
        .setRegTxId(aliceRegTxId)
        .setHashPrevSubTx(aliceContactAcceptTransactionId)
        .setHashSTPacket(stPacketHash)
        .setCreditFee(1000)
        .sign(alicePrivateKey);

      const aliceContactDeleteTransactionId = await dapiClient.sendRawTransition(
        transaction.serialize(),
        serializedPacket.toString('hex'),
      );

      expect(aliceContactDeleteTransactionId).to.be.a('string');
      expect(aliceContactDeleteTransactionId).to.be.not.empty();

      let aliceContact;
      for (let i = 0; i <= attempts; i++) {
        // waiting for Bob's contact to be deleted from Alice
        aliceContact = await dapiClient.fetchDapObjects(dapId, 'contact', {});
        if (aliceContact.length === 1) {
          break;
        } else {
          await wait(timeout);
        }
      }

      expect(aliceContact).to.have.lengthOf(1);
      expect(aliceContact[0].blockchainUserId).to.be.equal(bobRegTxId);
      expect(aliceContact[0].object).to.be.deep.equal(
        {
          act: 0,
          idx: 0,
          rev: 0,
          objtype: 'contact',
          relation: aliceRegTxId,
          hdextpubkey: bobPrivateKey.toPublicKey().toString('hex'),
        },
      );
    });
  });
});
