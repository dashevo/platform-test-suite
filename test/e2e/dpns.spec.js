const crypto = require('crypto');
const bs58 = require('bs58');

const entropy = require('@dashevo/dpp/lib/util/entropy');
const { hash } = require('@dashevo/dpp/lib/util/multihashDoubleSHA256');

const createClientWithFundedWallet = require('../../lib/test/createClientWithFundedWallet');

const getRandomDomain = () => crypto.randomBytes(10).toString('hex');

describe('DPNS', () => {
  // Use https://github.com/mochajs/mocha/issues/2894#issuecomment-492979837
  let failed = false;
  let client;
  let identity;
  let topLevelDomain;
  let secondLevelDomain;
  let registeredDomain;

  // Skip test if any prior test in this describe failed
  beforeEach(function beforeEach() {
    if (failed) {
      this.skip();
    }
  });

  afterEach(function afterEach() {
    failed = this.currentTest.state === 'failed';
  });

  before(async () => {
    topLevelDomain = 'dash';
    secondLevelDomain = getRandomDomain();
    client = await createClientWithFundedWallet();
  });

  after(async () => {
    await client.disconnect();
  });

  it('should exists', async () => {
    const createdDataContract = await client.platform.contracts.get(process.env.DPNS_CONTRACT_ID);

    expect(createdDataContract.getId()).to.equal(process.env.DPNS_CONTRACT_ID);
  });

  describe('DPNS owner', () => {
    let createdTLD;
    let newTopLevelDomain;
    let replaceTopLevelDomain;

    before(async () => {
      client = await createClientWithFundedWallet(process.env.IDENTITY_MNEMONIC);

      newTopLevelDomain = getRandomDomain();
      replaceTopLevelDomain = getRandomDomain();
      identity = await client.platform.identities.get(process.env.DPNS_TOP_LEVEL_IDENTITY);

      await client.platform.identities.topUp(process.env.DPNS_TOP_LEVEL_IDENTITY, 5);
    });

    after(async () => {
      await client.disconnect();
    });

    // generate a random one which will be used in tests above
    // skip if DPNS owner private key is not passed and use `dash` in tests above
    it('should be able to register a TLD', async () => {
      createdTLD = await client.platform.names.register(newTopLevelDomain, identity);
    });

    it('should not be able to update domain', async () => {
      const fullDomainName = replaceTopLevelDomain;

      const label = fullDomainName;
      const normalizedLabel = fullDomainName;
      const normalizedParentDomainName = '';

      const nameHash = hash(
        Buffer.from(fullDomainName),
      ).toString('hex');

      const records = { dashIdentity: process.env.DPNS_TOP_LEVEL_IDENTITY };

      const preorderSalt = entropy.generate();

      const slatedDomainHashBuffer = Buffer.concat([
        bs58.decode(preorderSalt),
        Buffer.from(nameHash, 'hex'),
      ]);

      const saltedDomainHash = hash(
        slatedDomainHashBuffer,
      ).toString('hex');

      const preorderDocument = await client.platform.documents.create(
        'preorder',
        identity,
        {
          saltedDomainHash,
        },
      );

      await client.platform.documents.broadcast({
        create: [preorderDocument],
      }, identity);

      const newDocument = await client.platform.documents.create(
        'domain',
        identity,
        {
          $id: createdTLD.getId(),
          nameHash,
          label,
          normalizedLabel,
          normalizedParentDomainName,
          preorderSalt,
          records,
        },
      );

      try {
        await client.platform.documents.broadcast({
          replace: [newDocument],
        }, identity);

        expect.fail('should throw an error');
      } catch (e) {
        expect(e.code).to.equal(3);
        const [error] = JSON.parse(e.metadata.get('errors'));
        expect(error.name).to.equal('DataTriggerConditionError');
        expect(error.message).to.equal('Update action is not allowed');
      }
    });

    it('should not be able to delete domain', async () => {
      try {
        await client.platform.documents.broadcast({
          delete: [createdTLD],
        }, identity);

        expect.fail('should throw an error');
      } catch (e) {
        expect(e.code).to.equal(3);
        const [error] = JSON.parse(e.metadata.get('errors'));
        expect(error.name).to.equal('DataTriggerConditionError');
        expect(error.message).to.equal('Delete action is not allowed');
      }
    });
  });

  describe('Any Identity', () => {
    before(async () => {
      client = await createClientWithFundedWallet();
      identity = await client.platform.identities.register(5);
    });

    after(async () => {
      await client.disconnect();
    });

    it('should not be able to register TLD', async () => {
      try {
        await client.platform.names.register(getRandomDomain(), identity);

        expect.fail('Should throw error');
      } catch (e) {
        expect(e.code).to.equal(3);
        const [error] = JSON.parse(e.metadata.get('errors'));
        expect(error.name).to.equal('DataTriggerConditionError');
      }
    });

    it('should be able to register a second level domain', async () => {
      registeredDomain = await client.platform.names.register(`${secondLevelDomain}.${topLevelDomain}`, identity);

      expect(registeredDomain.getType()).to.equal('domain');
      expect(registeredDomain.getData().label).to.equal(secondLevelDomain);
      expect(registeredDomain.getData().normalizedParentDomainName).to.equal(topLevelDomain);
    });

    it('should not be able to register a subdomain for parent domain which is not exist', async () => {
      try {
        const domain = `${getRandomDomain()}.${getRandomDomain()}.${topLevelDomain}`;

        await client.platform.names.register(domain, identity);

        expect.fail('Should throw error');
      } catch (e) {
        expect(e.code).to.equal(3);
        const [error] = JSON.parse(e.metadata.get('errors'));
        expect(error.name).to.equal('DataTriggerConditionError');
        // expect(error.message).to.equal('Can\'t create top level domain for this identity');
      }
    });

    it('should be able to search a domain', async () => {
      const documents = await client.platform.names.search(secondLevelDomain, topLevelDomain);

      expect(documents).to.have.lengthOf(1);

      const [document] = documents;

      expect(document.toJSON()).to.deep.equal(registeredDomain.toJSON());
    });

    it('should be able to resolve domain by it\'s name', async () => {
      const document = await client.platform.names.resolve(`${secondLevelDomain}.${topLevelDomain}`);

      expect(document.toJSON()).to.deep.equal(registeredDomain.toJSON());
    });

    it('should be able to resolve domain by it\'s record', async () => {
      const document = await client.platform.names.resolveByRecord(
        'dashIdentity',
        registeredDomain.getData().records.dashIdentity,
      );

      expect(document.toJSON()).to.deep.equal(registeredDomain.toJSON());
    });

    it('should not be able to update domain', async () => {
      const fullDomainName = `${secondLevelDomain}.${topLevelDomain}`;

      const label = secondLevelDomain;
      const normalizedLabel = secondLevelDomain;
      const normalizedParentDomainName = topLevelDomain;

      const nameHash = hash(
        Buffer.from(fullDomainName),
      ).toString('hex');

      const records = { dashIdentity: identity.getId() };

      const preorderSalt = entropy.generate();

      const slatedDomainHashBuffer = Buffer.concat([
        bs58.decode(preorderSalt),
        Buffer.from(nameHash, 'hex'),
      ]);

      const saltedDomainHash = hash(
        slatedDomainHashBuffer,
      ).toString('hex');

      const preorderDocument = await client.platform.documents.create(
        'preorder',
        identity,
        {
          saltedDomainHash,
        },
      );

      await client.platform.documents.broadcast({
        create: [preorderDocument],
      }, identity);

      const newDocument = await client.platform.documents.create(
        'domain',
        identity,
        {
          $id: registeredDomain.getId(),
          nameHash,
          label,
          normalizedLabel,
          normalizedParentDomainName,
          preorderSalt,
          records,
        },
      );

      try {
        await client.platform.documents.broadcast({
          replace: [newDocument],
        }, identity);

        expect.fail('should throw an error');
      } catch (e) {
        expect(e.code).to.equal(3);
        const [error] = JSON.parse(e.metadata.get('errors'));
        expect(error.name).to.equal('DataTriggerConditionError');
        expect(error.message).to.equal('Update action is not allowed');
      }
    });

    it('should not be able to delete domain', async () => {
      try {
        await client.platform.documents.broadcast({
          delete: [registeredDomain],
        }, identity);

        expect.fail('should throw an error');
      } catch (e) {
        expect(e.code).to.equal(3);
        const [error] = JSON.parse(e.metadata.get('errors'));
        expect(error.name).to.equal('DataTriggerConditionError');
        expect(error.message).to.equal('Delete action is not allowed');
      }
    });
  });
});
