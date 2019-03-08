const DAPIClient = require('@dashevo/dapi-client');
const DashPlatformProtocol = require('@dashevo/dpp');
const entropy = require('@dashevo/dpp/lib/util/entropy');
const DPObject = require('@dashevo/dpp/lib/object/DPObject');

const {
  Transaction,
  PrivateKey,
  PublicKey,
  Address,
} = require('@dashevo/dashcore-lib');

const wait = require('../../lib/wait');

describe('Contacts app', () => {
  const timeout = 1000;
  const attempts = 400;
  const testTimeout = 500000;

  let dpp;

  let dapiClient;

  let faucetPrivateKey;
  let faucetAddress;

  let bobPrivateKey;
  let bobUserName;
  let bobRegTxId;
  let alicePrivateKey;
  let aliceUserName;
  let aliceRegTxId;
  let aliceUser;
  let aliceContactAcceptance;

  let bobPreviousST;
  let alicePreviousST;

  before(() => {
    dpp = new DashPlatformProtocol();

    const seeds = process.env.DAPI_CLIENT_SEEDS
      .split(',')
      .map(ip => ({ service: `${ip}:${process.env.DAPI_CLIENT_PORT}` }));

    dapiClient = new DAPIClient({
      seeds,
    });

    faucetPrivateKey = new PrivateKey(process.env.FAUCET_PRIVATE_KEY);
    const faucetPublicKey = PublicKey.fromPrivateKey(faucetPrivateKey);
    faucetAddress = Address
      .fromPublicKey(faucetPublicKey, process.env.NETWORK === 'devnet' ? 'testnet' : process.env.NETWORK)
      .toString();

    bobUserName = Math.random().toString(36).substring(7);
    aliceUserName = Math.random().toString(36).substring(7);

    const dpContract = dpp.contract.create(entropy.generate(), {
      user: {
        properties: {
          avatarUrl: {
            type: 'string',
            format: 'url',
          },
          about: {
            type: 'string',
          },
        },
        required: ['avatarUrl', 'about'],
        additionalProperties: false,
      },
      contact: {
        properties: {
          toUserId: {
            type: 'string',
          },
          publicKey: {
            type: 'string',
          },
        },
        required: ['toUserId', 'publicKey'],
        additionalProperties: false,
      },
    });

    dpp.setDPContract(dpContract);
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

      expect(bobRegTxId).to.be.a('string');

      bobPreviousST = bobRegTxId;

      await dapiClient.generate(1);
      await wait(5000);

      const userByName = await dapiClient.getUserByName(bobUserName);
      expect(userByName.uname).to.be.equal(bobUserName);
    });

    it('should publish "Contacts" contract', async function it() {
      this.timeout(testTimeout);

      // 1. Create ST packet
      const stPacket = dpp.packet.create(dpp.getDPContract());

      // 2. Create State Transition
      const transaction = new Transaction()
        .setType(Transaction.TYPES.TRANSACTION_SUBTX_TRANSITION);

      transaction.extraPayload
        .setRegTxId(bobRegTxId)
        .setHashPrevSubTx(bobPreviousST)
        .setHashSTPacket(stPacket.hash())
        .setCreditFee(1000)
        .sign(bobPrivateKey);

      const transitionHash = await dapiClient.sendRawTransition(
        transaction.serialize(),
        stPacket.serialize().toString('hex'),
      );

      expect(transitionHash).to.be.a('string');
      expect(transitionHash).to.be.not.empty();

      bobPreviousST = transitionHash;

      // 3. Mine block with ST
      await dapiClient.generate(1);

      // 4. Fetch DAP Contract
      let dpContract;
      for (let i = 0; i <= attempts; i++) {
        try {
          // waiting for Contacts to be added
          dpContract = await dapiClient.fetchDapContract(dpp.getDPContract().getId());
          break;
        } catch (e) {
          await wait(timeout);
        }
      }

      expect(dpContract).to.be.deep.equal(dpp.getDPContract().getId());
    });

    it('should create profile in "Contacts" app', async function it() {
      this.timeout(testTimeout);

      dpp.setUserId(bobRegTxId);

      const user = dpp.object.create('user', {
        avatarUrl: 'http://test.com/bob.jpg',
        about: 'This is story about me',
      });

      // 1. Create ST profile packet
      const stPacket = dpp.packet.create([user]);

      // 2. Create State Transition
      const transaction = new Transaction()
        .setType(Transaction.TYPES.TRANSACTION_SUBTX_TRANSITION);

      transaction.extraPayload
        .setRegTxId(bobRegTxId)
        .setHashPrevSubTx(bobPreviousST)
        .setHashSTPacket(stPacket.hash())
        .setCreditFee(1000)
        .sign(bobPrivateKey);

      const transitionHash = await dapiClient.sendRawTransition(
        transaction.serialize(),
        stPacket.serialize().toString('hex'),
      );

      expect(transitionHash).to.be.a('string');
      expect(transitionHash).to.be.not.empty();

      bobPreviousST = transitionHash;

      // 3. Mine block with ST
      await dapiClient.generate(1);

      // 4. Fetch users
      let users;
      for (let i = 0; i <= attempts; i++) {
        users = await dapiClient.fetchDapObjects(
          dpp.getDPContract().getId(),
          'user',
          {},
        );

        // waiting for Bob's profile to be added
        if (users.length > 0) {
          break;
        } else {
          await wait(timeout);
        }
      }

      expect(users).to.have.lengthOf(1);
      expect(users[0]).to.be.deep.equal(user.toJSON());
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

      alicePreviousST = aliceRegTxId;

      await dapiClient.generate(1);
      await wait(5000);

      const userByName = await dapiClient.getUserByName(aliceUserName);

      expect(userByName.uname).to.be.equal(aliceUserName);
    });

    it('should create profile in "Contacts" app', async function it() {
      this.timeout(testTimeout);

      dpp.setUserId(aliceRegTxId);

      aliceUser = dpp.object.create('user', {
        avatarUrl: 'http://test.com/alice.jpg',
        about: 'I am Alice',
      });

      // 1. Create ST user packet
      const stPacket = dpp.packet.create([aliceUser]);

      // 2. Create State Transition
      const transaction = new Transaction()
        .setType(Transaction.TYPES.TRANSACTION_SUBTX_TRANSITION);

      transaction.extraPayload
        .setRegTxId(aliceRegTxId)
        .setHashPrevSubTx(alicePreviousST)
        .setHashSTPacket(stPacket.hash())
        .setCreditFee(1000)
        .sign(alicePrivateKey);

      const transitionHash = await dapiClient.sendRawTransition(
        transaction.serialize(),
        stPacket.serialize().toString('hex'),
      );

      expect(transitionHash).to.be.a('string');
      expect(transitionHash).to.be.not.empty();

      alicePreviousST = transitionHash;

      // 3. Mine block with ST
      await dapiClient.generate(1);

      // 4. Fetch users
      let users;
      for (let i = 0; i <= attempts; i++) {
        users = await dapiClient.fetchDapObjects(
          dpp.getDPContract().getId(),
          'user',
          {},
        );

        // waiting for Alice's profile to be added
        if (users.length > 1) {
          break;
        } else {
          await wait(timeout);
        }
      }

      expect(users).to.have.lengthOf(2);
      expect(users[1]).to.be.deep.equal(aliceUser.toJSON());
    });

    it('should be able to update her profile', async function it() {
      this.timeout(testTimeout);

      dpp.setUserId(aliceRegTxId);

      aliceUser.setAction(DPObject.ACTIONS.UPDATE);
      aliceUser.set('avatarUrl', 'http://test.com/alice2.jpg');

      // 1. Create ST update profile packet
      const stPacket = dpp.packet.create([aliceUser]);

      // 2. Create State Transition
      const transaction = new Transaction()
        .setType(Transaction.TYPES.TRANSACTION_SUBTX_TRANSITION);

      transaction.extraPayload
        .setRegTxId(aliceRegTxId)
        .setHashPrevSubTx(alicePreviousST)
        .setHashSTPacket(stPacket.hash())
        .setCreditFee(1000)
        .sign(alicePrivateKey);

      const transitionHash = await dapiClient.sendRawTransition(
        transaction.serialize(),
        stPacket.serialize().toString('hex'),
      );

      expect(transitionHash).to.be.a('string');
      expect(transitionHash).to.be.not.empty();

      alicePreviousST = transitionHash;

      // 3. Mine block with ST
      await dapiClient.generate(1);

      // 4. Fetch users
      let users;
      for (let i = 0; i <= attempts; i++) {
        users = await dapiClient.fetchDapObjects(
          dpp.getDPContract().getId(),
          'user',
          {},
        );

        // waiting for Alice's profile modified
        if (users.length === 2 && users[1].act === 1) {
          break;
        } else {
          await wait(timeout);
        }
      }

      expect(users).to.have.lengthOf(2);
      expect(users[1]).to.be.deep.equal(aliceUser.toJSON());
    });
  });

  describe('Bob', () => {
    it('should be able to send contact request', async function it() {
      this.timeout(testTimeout);

      dpp.setUserId(bobRegTxId);

      const contactRequest = dpp.object.create('contact', {
        toUserId: aliceRegTxId,
        publicKey: bobPrivateKey.toPublicKey().toString('hex'),
      });

      // 1. Create ST contact request packet
      const stPacket = dpp.packet.create([contactRequest]);

      // 2. Create State Transition
      const transaction = new Transaction()
        .setType(Transaction.TYPES.TRANSACTION_SUBTX_TRANSITION);

      transaction.extraPayload
        .setRegTxId(bobRegTxId)
        .setHashPrevSubTx(bobPreviousST)
        .setHashSTPacket(stPacket.hash())
        .setCreditFee(1000)
        .sign(bobPrivateKey);

      const transitionHash = await dapiClient.sendRawTransition(
        transaction.serialize(),
        stPacket.serialize().toString('hex'),
      );

      expect(transitionHash).to.be.a('string');
      expect(transitionHash).to.be.not.empty();

      bobPreviousST = transitionHash;

      // 3. Mine block with ST
      await dapiClient.generate(1);

      // 4. Fetch contacts
      let contacts;
      for (let i = 0; i <= attempts; i++) {
        contacts = await dapiClient.fetchDapObjects(
          dpp.getDPContract().getId(),
          'contact',
          {},
        );

        // waiting for Bob's contact request to be added
        if (contacts.length > 0) {
          break;
        } else {
          await wait(timeout);
        }
      }

      expect(contacts).to.have.lengthOf(1);
      expect(contacts[0]).to.be.deep.equal(contactRequest.toJSON());
    });
  });

  describe('Alice', () => {
    it('should be able to approve contact request', async function it() {
      this.timeout(testTimeout);

      dpp.setUserId(aliceRegTxId);

      aliceContactAcceptance = dpp.object.create('contact', {
        toUserId: bobRegTxId,
        publicKey: alicePrivateKey.toPublicKey().toString('hex'),
      });

      // 1. Create ST approve contact packet
      const stPacket = dpp.packet.create([aliceContactAcceptance]);

      // 2. Create State Transition
      const transaction = new Transaction()
        .setType(Transaction.TYPES.TRANSACTION_SUBTX_TRANSITION);

      transaction.extraPayload
        .setRegTxId(aliceRegTxId)
        .setHashPrevSubTx(alicePreviousST)
        .setHashSTPacket(stPacket.hash())
        .setCreditFee(1000)
        .sign(alicePrivateKey);

      const transitionHash = await dapiClient.sendRawTransition(
        transaction.serialize(),
        stPacket.serialize().toString('hex'),
      );

      expect(transitionHash).to.be.a('string');
      expect(transitionHash).to.be.not.empty();

      alicePreviousST = transitionHash;

      // 3. Mine block with ST
      await dapiClient.generate(1);

      // 4. Fetch contacts
      let contacts;
      for (let i = 0; i <= attempts; i++) {
        contacts = await dapiClient.fetchDapObjects(
          dpp.getDPContract().getId(),
          'contact',
          {},
        );

        // waiting for Bob's contact to be approved from Alice
        if (contacts.length > 1) {
          break;
        } else {
          await wait(timeout);
        }
      }

      expect(contacts).to.have.lengthOf(2);
      expect(contacts[1]).to.be.deep.equal(aliceContactAcceptance.toJSON());
    });

    it('should be able to remove contact approvement', async function it() {
      this.timeout(testTimeout);

      dpp.setUserId(aliceRegTxId);

      aliceContactAcceptance.setAction(DPObject.ACTIONS.DELETE);

      // 1. Create ST contact delete packet
      const stPacket = dpp.packet.create([aliceContactAcceptance]);

      // 2. Create State Transition
      const transaction = new Transaction()
        .setType(Transaction.TYPES.TRANSACTION_SUBTX_TRANSITION);

      transaction.extraPayload
        .setRegTxId(aliceRegTxId)
        .setHashPrevSubTx(alicePreviousST)
        .setHashSTPacket(stPacket.hash())
        .setCreditFee(1000)
        .sign(alicePrivateKey);

      const transitionHash = await dapiClient.sendRawTransition(
        transaction.serialize(),
        stPacket.serialize().toString('hex'),
      );

      expect(transitionHash).to.be.a('string');
      expect(transitionHash).to.be.not.empty();

      alicePreviousST = transitionHash;

      // 3. Mine block with ST
      await dapiClient.generate(1);

      // 4. Fetch contacts
      let contacts;
      for (let i = 0; i <= attempts; i++) {
        // waiting for Bob's contact to be deleted from Alice
        contacts = await dapiClient.fetchDapObjects(
          dpp.getDPContract().getId(),
          'contact',
          {},
        );

        if (contacts.length === 1) {
          break;
        } else {
          await wait(timeout);
        }
      }

      expect(contacts).to.have.lengthOf(1);
      expect(contacts[0]).to.be.deep.equal(aliceContactAcceptance.toJSON());
    });
  });
});
