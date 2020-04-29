const Dash = require('dash');

const Identity = require('@dashevo/dpp/lib/identity/Identity');

describe('Contacts', function contacts() {
  this.timeout(150000);

  let dpp;
  let dataContract;

  let dashClient;

  let bobIdentity;
  let bobContactRequest;
  let aliceIdentity;
  let aliceProfile;
  let aliceContactAcceptance;

  let dataContractDocumentSchemas;

  before(() => {
    const seeds = process.env.DAPI_SEED
      .split(',')
      .map(seed => ({ service: `${seed}` }));

    dashClient = new Dash.Client({
      seeds,
      mnemonic: '', // TODO: find a way to get it
    });

    dataContractDocumentSchemas = {
      profile: {
        indices: [
          { properties: [{ $ownerId: 'asc' }], unique: true },
        ],
        properties: {
          avatarUrl: {
            type: 'string',
            format: 'url',
            maxLength: 255,
          },
          about: {
            type: 'string',
            maxLength: 255,
          },
        },
        required: ['avatarUrl', 'about'],
        additionalProperties: false,
      },
      contact: {
        indices: [
          { properties: [{ $ownerId: 'asc' }, { toUserId: 'asc' }], unique: true },
        ],
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
    };
  });

  describe('Bob', () => {
    it('should create user identity', async () => {
      bobIdentity = await dashClient.platform.identities.register();

      expect(bobIdentity).to.be.instanceOf(Identity);
    });

    it('should publish "Contacts" data contract', async () => {
      // 1. Create and broadcast data contract
      dataContract = await dashClient.platform.contracts.create(
        dataContractDocumentSchemas, bobIdentity,
      );

      await dashClient.platform.contracts.broadcast(dataContract, bobIdentity);

      dashClient.apps.contacts = {
        contractId: dataContract.getId(),
        contract: dataContract,
      };

      // 2. Fetch and check data contract
      const fetchedDataContract = await dashClient.platform.contracts.get(
        dataContract.getId(),
      );

      expect(fetchedDataContract.toJSON()).to.be.deep.equal(dataContract.toJSON());
    });

    it('should create profile in "Contacts" app', async () => {
      // 1. Create and broadcast profile
      const profile = await dashClient.platform.documents.create('contacts.profile', bobIdentity, {
        avatarUrl: 'http://test.com/bob.jpg',
        about: 'This is story about me',
      });

      await dashClient.platform.documents.broadcast({
        create: [profile],
      }, bobIdentity);

      // 2. Fetch and compare profiles
      const [fetchedProfile] = await dashClient.platform.documents.get(
        'contacts.profile',
        { where: [['$id', '==', profile.getId()]] },
      );

      expect(fetchedProfile.toJSON()).to.be.deep.equal(profile.toJSON());
    });
  });

  describe('Alice', () => {
    it('should create user identity', async () => {
      aliceIdentity = await dashClient.platform.identities.register();

      expect(aliceIdentity).to.be.instanceOf(Identity);
    });

    it('should create profile in "Contacts" app', async () => {
      // 1. Create and broadcast profile
      aliceProfile = dashClient.platform.documents.create('contacts.profile', aliceIdentity, {
        avatarUrl: 'http://test.com/alice.jpg',
        about: 'I am Alice',
      });

      await dashClient.platform.documents.broadcast({
        create: [aliceProfile],
      }, aliceIdentity);

      // 2. Fetch and compare profile
      const [fetchedProfile] = await dashClient.platform.documents.get(
        'contacts.profile',
        { where: [['$id', '==', aliceProfile.getId()]] },
      );

      expect(fetchedProfile.toJSON()).to.be.deep.equal(aliceProfile.toJSON());
    });

    it('should be able to update her profile', async () => {
      // 1. Update profile document
      aliceProfile.set('avatarUrl', 'http://test.com/alice2.jpg');

      // 2. Broadcast change
      await dashClient.platform.documents.broadcast({
        replace: [aliceProfile],
      }, aliceIdentity);

      // 3. Fetch and compare profile
      const [fetchedProfile] = await dashClient.platform.documents.get(
        'contacts.profile',
        { where: [['$id', '==', aliceProfile.getId()]] },
      );

      expect(fetchedProfile.toJSON()).to.be.deep.equal({
        ...aliceProfile.toJSON(),
        $revision: 2,
      });
    });
  });

  describe('Bob', () => {
    it('should be able to send contact request', async () => {
      // 1. Create and broadcast contact document
      bobContactRequest = dashClient.platform.documents.create('contacts.contact', bobIdentity, {
        toUserId: aliceIdentity.getId(),
        publicKey: bobIdentity.getPublicKeyById(0).getData(),
      });

      await dashClient.platform.documents.broadcast(bobContactRequest, bobIdentity);

      // 2. Fetch and compare contacts
      const [fetchedContactRequest] = await dashClient.platform.documents.get(
        'contacts.contact',
        { where: [['$id', '==', bobContactRequest.getId()]] },
      );

      expect(fetchedContactRequest.toJSON()).to.be.deep.equal(bobContactRequest.toJSON());
    });
  });

  describe('Alice', () => {
    it('should be able to approve contact request', async () => {
      // 1. Create and broadcast contact approval document
      aliceContactAcceptance = dpp.document.create('contacts.contact', aliceIdentity, {
        toUserId: bobIdentity.getId(),
        publicKey: aliceIdentity.getPublicKeyById(0).getData(),
      });

      await dashClient.platform.documents.broadcast(aliceContactAcceptance, aliceIdentity);

      // 2. Fetch and compare contacts
      const [fetchedAliceContactAcceptance] = await dashClient.platform.documents.get(
        'contacts.contact',
        { where: [['$id', '==', aliceContactAcceptance.getId()]] },
      );

      expect(fetchedAliceContactAcceptance.toJSON()).to.be.deep.equal(
        aliceContactAcceptance.toJSON(),
      );
    });

    it('should be able to remove contact approval', async () => {
      // 1. Broadcast document deletion
      await dashClient.platform.documents.broadcast({
        delete: [aliceContactAcceptance],
      }, aliceIdentity);

      // 2. Fetch contact documents and check it does not exists
      const [fetchedAliceContactAcceptance] = await dashClient.platform.documents.get(
        'contacts.contact',
        { where: [['$id', '==', aliceContactAcceptance.getId()]] },
      );

      expect(fetchedAliceContactAcceptance).to.not.exist();
    });
  });
});
