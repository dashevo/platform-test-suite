const DAPIClient = require('@dashevo/dapi-client');
const DashPlatformProtocol = require('@dashevo/dpp');
const Document = require('@dashevo/dpp/lib/document/Document');

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
  const testTimeout = 600000;

  let dpp;

  let dapiClient;

  let faucetPrivateKey;
  let faucetAddress;

  let bobPrivateKey;
  let bobUserName;
  let bobRegTxId;
  let bobContactRequest;
  let alicePrivateKey;
  let aliceUserName;
  let aliceRegTxId;
  let aliceProfile;
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
      timeout: 30000,
    });

    faucetPrivateKey = new PrivateKey(process.env.FAUCET_PRIVATE_KEY);
    const faucetPublicKey = PublicKey.fromPrivateKey(faucetPrivateKey);
    faucetAddress = Address
      .fromPublicKey(faucetPublicKey, process.env.NETWORK === 'devnet' ? 'testnet' : process.env.NETWORK)
      .toString();

    bobUserName = Math.random().toString(36).substring(7);
    aliceUserName = Math.random().toString(36).substring(7);
  });

  describe('Bob', () => {
    it('should fetch exists contract', async function it() {
      // Fetch contract
      const contractJSON = await dapiClient.fetchContract('84Cdj9cB6bakxC6SWCGns7bZxNg6b5VmPJ36pkVdzHw7');

      expect(contractJSON).to.not.be.null();

      const contract = dpp.contract.createFromObject(contractJSON);

      dpp.setContract(contract);
    });

    it('should register blockchain user', async function it() {
      this.timeout(50000);

      bobPrivateKey = new PrivateKey();
      const validPayload = new Transaction.Payload.SubTxRegisterPayload()
        .setUserName(bobUserName)
        .setPubKeyIdFromPrivateKey(bobPrivateKey)
        .sign(bobPrivateKey);

      const { items: inputs } = await dapiClient.getUTXO(faucetAddress);

      expect(inputs).to.be.an('array').and.not.empty();

      const transaction = Transaction()
        .setType(Transaction.TYPES.TRANSACTION_SUBTX_REGISTER)
        .setExtraPayload(validPayload)
        .from(inputs.slice(-1)[0])
        .addFundingOutput(10000)
        .change(faucetAddress)
        .sign(faucetPrivateKey);

      bobRegTxId = await dapiClient.sendRawTransaction(transaction.serialize());

      expect(bobRegTxId).to.be.a('string');

      bobPreviousST = bobRegTxId;

      await dapiClient.generate(1);
      await wait(5000);

      const userByName = await dapiClient.getUserByName(bobUserName);
      expect(userByName.uname).to.be.equal(bobUserName);
    });

    it.skip('should publish "Contacts" contract', async function it() {
      this.timeout(testTimeout);

      // 1. Create ST packet
      const stPacket = dpp.packet.create(dpp.getContract());

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
      let contract;
      for (let i = 0; i <= attempts; i++) {
        try {
          // waiting for Contacts to be added
          contract = await dapiClient.fetchContract(dpp.getContract().getId());
          break;
        } catch (e) {
          await wait(timeout);
        }
      }

      expect(contract).to.be.deep.equal(dpp.getContract().toJSON());
    });

    it('should create profile in "Contacts" app', async function it() {
      this.timeout(testTimeout);

      dpp.setUserId(bobRegTxId);

      const randomAbout = Math.random().toString(36).substring(7);

      const profile = dpp.document.create('profile', {
        avatarUrl: 'http://test.com/bob.jpg',
        about: randomAbout,
      });

      const result = dpp.document.validate(profile);
      expect(result.isValid(), 'Profile must be valid').to.be.true();

      // 1. Create ST profile packet
      const stPacket = dpp.packet.create([profile]);

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

      // 4. Fetch profiles
      let bobProfile;
      for (let i = 0; i <= attempts; i++) {
        const profiles = await dapiClient.fetchDocuments(
          dpp.getContract().getId(),
          'profile',
          {},
        );

        // waiting for Bob's profile to be added
        bobProfile = profiles.find(p => p.about === randomAbout);
        if (bobProfile) {
          break;
        } else {
          await wait(timeout);
        }
      }

      expect(bobProfile).to.be.deep.equal(profile.toJSON());
    });
  });

  describe('Alice', () => {
    it('should register blockchain user', async function it() {
      this.timeout(50000);

      alicePrivateKey = new PrivateKey();
      const validPayload = new Transaction.Payload.SubTxRegisterPayload()
        .setUserName(aliceUserName)
        .setPubKeyIdFromPrivateKey(alicePrivateKey).sign(alicePrivateKey);

      const { items: inputs } = await dapiClient.getUTXO(faucetAddress);

      expect(inputs).to.be.an('array').and.not.empty();

      const transaction = Transaction()
        .setType(Transaction.TYPES.TRANSACTION_SUBTX_REGISTER)
        .setExtraPayload(validPayload)
        .from(inputs.slice(-1)[0])
        .addFundingOutput(10000)
        .change(faucetAddress)
        .sign(faucetPrivateKey);

      aliceRegTxId = await dapiClient.sendRawTransaction(transaction.serialize());

      alicePreviousST = aliceRegTxId;

      await dapiClient.generate(1);
      await wait(5000);

      const userByName = await dapiClient.getUserByName(aliceUserName);

      expect(userByName.uname).to.be.equal(aliceUserName);
    });

    it.skip('should create profile in "Contacts" app', async function it() {
      this.timeout(testTimeout);

      dpp.setUserId(aliceRegTxId);

      aliceProfile = dpp.document.create('profile', {
        avatarUrl: 'http://test.com/alice.jpg',
        about: 'I am Alice',
      });

      const result = dpp.document.validate(aliceProfile);
      expect(result.isValid(), 'Profile must be valid').to.be.true();

      // 1. Create ST Packet
      const stPacket = dpp.packet.create([aliceProfile]);

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

      // 4. Fetch profiles
      let profiles;
      for (let i = 0; i <= attempts; i++) {
        profiles = await dapiClient.fetchDocuments(
          dpp.getContract().getId(),
          'profile',
          {},
        );

        // waiting for Alice's profile to be added
        if (profiles.length > 1) {
          break;
        } else {
          await wait(timeout);
        }
      }

      expect(profiles).to.have.lengthOf(2);
      expect(profiles[1]).to.be.deep.equal(aliceProfile.toJSON());
    });

    it.skip('should be able to update her profile', async function it() {
      this.timeout(testTimeout);

      dpp.setUserId(aliceRegTxId);

      aliceProfile.setAction(Document.ACTIONS.UPDATE);
      aliceProfile.setRevision(2);
      aliceProfile.set('avatarUrl', 'http://test.com/alice2.jpg');

      const result = dpp.document.validate(aliceProfile);
      expect(result.isValid(), 'Profile must be valid').to.be.true();

      // 1. Create ST update profile packet
      const stPacket = dpp.packet.create([aliceProfile]);

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

      // 4. Fetch profile
      let profiles;
      for (let i = 0; i <= attempts; i++) {
        profiles = await dapiClient.fetchDocuments(
          dpp.getContract().getId(),
          'profile',
          {},
        );

        // waiting for Alice's profile modified
        if (profiles.length === 2 && profiles[1].$rev === 2) {
          break;
        } else {
          await wait(timeout);
        }
      }

      expect(profiles).to.have.lengthOf(2);
      expect(profiles[1]).to.be.deep.equal(aliceProfile.toJSON());
    });
  });

  describe('Bob', () => {
    it('should be able to send contact request', async function it() {
      this.timeout(testTimeout);

      dpp.setUserId(bobRegTxId);

      bobContactRequest = dpp.document.create('contact', {
        toUserId: aliceRegTxId,
        extendedPublicKey: bobPrivateKey.toPublicKey().toString('hex'),
      });

      const result = dpp.document.validate(bobContactRequest);
      expect(result.isValid(), 'Contact request must be valid').to.be.true();

      // 1. Create ST contact request packet
      const stPacket = dpp.packet.create([bobContactRequest]);

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
      let contactToAlice;
      for (let i = 0; i <= attempts; i++) {
        const contacts = await dapiClient.fetchDocuments(
          dpp.getContract().getId(),
          'contact',
          {},
        );

        // waiting for Bob's contact request to be added
        contactToAlice = contacts.find(c => c.toUserId === aliceRegTxId);
        if (contactToAlice) {
          break;
        } else {
          await wait(timeout);
        }
      }

      expect(contactToAlice).to.be.deep.equal(bobContactRequest.toJSON());
    });
  });

  describe.skip('Alice', () => {
    it('should be able to approve contact request', async function it() {
      this.timeout(testTimeout);

      dpp.setUserId(aliceRegTxId);

      aliceContactAcceptance = dpp.document.create('contact', {
        toUserId: bobRegTxId,
        extendedPublicKey: alicePrivateKey.toPublicKey().toString('hex'),
      });

      const result = dpp.document.validate(aliceContactAcceptance);
      expect(result.isValid(), 'Contact acceptance must be valid').to.be.true();

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
        contacts = await dapiClient.fetchDocuments(
          dpp.getContract().getId(),
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

      aliceContactAcceptance.setData({});
      aliceContactAcceptance.setAction(Document.ACTIONS.DELETE);
      aliceContactAcceptance.setRevision(2);

      const result = dpp.document.validate(aliceContactAcceptance);
      expect(result.isValid(), 'Contact acceptance must be valid').to.be.true();

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
        contacts = await dapiClient.fetchDocuments(
          dpp.getContract().getId(),
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
      expect(contacts[0]).to.be.deep.equal(bobContactRequest.toJSON());
    });
  });
});
