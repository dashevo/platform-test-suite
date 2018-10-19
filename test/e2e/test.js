const cbor = require('cbor');
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

const timeout = ms => new Promise(res => setTimeout(res, ms));

describe('Contacts app', () => {
  const options = {
    debug: false,
    verbose: false,
    errors: false,
    warnings: false,
    seeds: [{ ip: '54.191.116.37' }],
  };
  let privateForUser;
  const dapi = new DAPIClient(options, 3000);
  const privateKey = new PrivateKey('cR4t6evwVZoCp1JsLk4wURK4UmBCZzZotNzn9T1mhBT19SH9JtNt');

  describe('Bob', () => {
    const userName = Math.random().toString(36).substring(7);
    let regTxId;

    it('should register blockchain user', async () => {
      const publicKey = PublicKey.fromPrivateKey(privateKey);
      const address = Address
        .fromPublicKey(publicKey, 'testnet')
        .toString();

      privateForUser = new PrivateKey();
      const validPayload = new Transaction.Payload.SubTxRegisterPayload()
        .setUserName(userName)
        .setPubKeyIdFromPrivateKey(privateForUser).sign(privateForUser);

      const inputs = await dapi.getUTXO(address);

      const transaction = Transaction()
        .setType(Transaction.TYPES.TRANSACTION_SUBTX_REGISTER)
        .setExtraPayload(validPayload)
        .from(inputs.slice(-1)[0])
        .addFundingOutput(10000)
        .change(address)
        .sign(privateKey);

      regTxId = await dapi.sendRawTransaction(transaction.serialize());

      await timeout(5000);// await dapi.generate(1);

      const userByName = await dapi.getUserByName(userName);
      expect(userByName.uname).to.be.equal(userName);
    });

    it('should create "Contacts" app', async () => {
      // 1. Create schema
      const dapSchema = Object.assign({}, DashPay);
      dapSchema.title = `TestContacts_${userName}`;

      // 2. Create contract
      const dapContract = Schema.create.dapcontract(dapSchema);
      const dapId = doubleSha256(cbor.encodeCanonical(dapContract.dapcontract));

      // 3. Create ST packet
      const { stpacket: packet } = Schema.create.stpacket(dapContract, dapId);
      delete packet.meta;

      // 4. Create State Transition
      const transaction = new Transaction()
        .setType(Transaction.TYPES.TRANSACTION_SUBTX_TRANSITION);

      transaction.extraPayload
        .setRegTxId(regTxId)
        .setHashPrevSubTx(regTxId)
        .setHashSTPacket(dapId)
        .setCreditFee(1000)
        .sign(privateForUser);

      const st = await dapi.sendRawTransition(
        transaction.serialize(),
        Schema.serialize.encode(packet),
      );

      console.log(st);
      await timeout(5000);// await dapi.generate(1);

      const dapContractFromDAPI = await dapi.fetchDapContract(dashPayId);

      console.log(dapContractFromDAPI);

      expect(dapContractFromDAPI.error).to.be.empty();
    });

    xit('should create profile in "Contacts" app', async () => {

    });
  });

  xdescribe('Alice', () => {
    it('should register blockchain user', async () => {

    });
    it('should create profile in "Contacts" app', async () => {

    });
    it('should update only her profile', async () => {

    });
  });

  xdescribe('Bob', () => {
    it('should be able to send contact request', async () => {

    });
  });

  xdescribe('Alice', () => {
    it('should be able to approve contact request', async () => {

    });
    it('should be able to remove only here contact object', async () => {

    });
  });
});
