const sha256 = require('sha256');
const cbor = require('cbor');
const crypto = require('crypto');

const DAPIClient = require('@dashevo/dapi-client');
const BitcoreLib = require('@dashevo/dashcore-lib');
const Schema = require('@dashevo/dash-schema/dash-schema-lib');
const DashPay = require('@dashevo/dash-schema/dash-core-daps');


const Transaction = BitcoreLib.Transaction;
const Payload = BitcoreLib.Transaction.Payload;
const SubTxRegisterPayload = Payload.SubTxRegisterPayload;
const SubTxTransitionPayload = Payload.SubTxTransitionPayload;


const { PrivateKey, PublicKey, Address } = BitcoreLib;
const timeout = ms => new Promise(res => setTimeout(res, ms));

const doubleSha256 = (data, cryptoLib = crypto) => {
  // The implementation of hash in Node.js is stateful and requires separate objects
  const hasher1 = cryptoLib.createHash('sha256');
  const firstHash = hasher1.update(data).digest();
  const hasher2 = cryptoLib.createHash('sha256');
  const secondHashHexDigest = hasher2.update(firstHash).digest('hex');
  return secondHashHexDigest;
};

describe('Contacts app', () => {
  const options = {
    debug: false,
    verbose: false,
    errors: false,
    warnings: false,
    seeds: [{ ip: '54.191.116.37' }],
  };
  let dashPayId = 'b4de10e1ddb8e225cd04a406deb98e6081f9bd26f98f46c0932d0bdfb2bd0623';
  let privateForUser;
  let regTxId;
  const userName = Math.random().toString(36).substring(7);
  const dapi = new DAPIClient(options, 3000);
  const privateKey = new BitcoreLib.PrivateKey('cR4t6evwVZoCp1JsLk4wURK4UmBCZzZotNzn9T1mhBT19SH9JtNt');

  describe('Bob', () => {
    it('should register blockchain user', async () => {
      const publicKey = PublicKey.fromPrivateKey(privateKey);
      const address = Address
        .fromPublicKey(publicKey, 'testnet')
        .toString();

      privateForUser = new BitcoreLib.PrivateKey();
      const validPayload = new SubTxRegisterPayload()
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
      DashPay.title = `title_${userName}`;
      const dapContract = Schema.create.dapcontract(DashPay);
      const dashPayIdNew = sha256(sha256(cbor.encodeCanonical(dapContract.dapcontract)));
      // let blockchainUser = await dapi.getUserByName('ilf3qb');
      const blockchainUser = await dapi.getUserByName(userName);
      let dashPayDataContract = await dapi.fetchDapContract(dashPayIdNew);

      if (dashPayDataContract.error.message === 'Dap Contract not found' || dashPayDataContract.error.message === 'Initial sync in progress') {
        console.log('DashPay data contract not found. Creating one');

        dashPayId = sha256(sha256(cbor.encodeCanonical(dapContract.dapcontract)));
        const stpacket = Schema.create.stpacket(dapContract, dashPayId);

        // const stheader = Schema.create.stheader(stpacket, blockchainUser.pubkeyid, dashPayId);

        const transaction = new Transaction()
          .setType(Transaction.TYPES.TRANSACTION_SUBTX_TRANSITION);

        delete stpacket.stpacket.meta;

        transaction.extraPayload
          .setRegTxId(blockchainUser.regtxid)
          .setHashPrevSubTx(blockchainUser.regtxid)
          .setHashSTPacket(doubleSha256(Buffer.from(Schema.serialize.encode(stpacket).toString('hex'), 'hex')))
          .setCreditFee(1000)
          .sign(privateForUser);

        console.dir(stpacket);
        dashPayId = await dapi.sendRawTransition(
          transaction.serialize(),
          Schema.serialize.encode(stpacket).toString('hex'),
        );

        console.log(dashPayId);
        await timeout(5000);// await dapi.generate(1);
        dashPayDataContract = await dapi.fetchDapContract(doubleSha256(Buffer.from(Schema.serialize.encode(dapContract.dapcontract).toString('hex'), 'hex')));
        console.log(dashPayDataContract);
        expect(dashPayDataContract.error).to.be.empty();
      }
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
