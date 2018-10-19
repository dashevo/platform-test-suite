const cbor = require('cbor');
const RpcClient = require('@dashevo/dashd-rpc/promise');

const Schema = require('@dashevo/dash-schema/dash-schema-lib');
const DashPay = require('@dashevo/dash-schema/dash-core-daps');

const DAPIClient = require('@dashevo/dapi-client');

const createSTHeader = require('../../lib/createHeader');
const createUser = require('../../lib/createUser');
const doubleSha256 = require('../../lib/doubleSha256');

const timeout = ms => new Promise(res => setTimeout(res, ms));

describe('test', () => {
  it('sendContract', async () => {
    // Create user
    const api = new RpcClient({
      protocol: 'http',
      host: process.env.DAPI_CLIENT_SEEDS,
      port: 20002,
      user: 'dashrpc',
      pass: 'password',
    });

    const userName = Math.random().toString(36).substring(7);

    const { userId, privateKeyString } = await createUser(userName, api);

    // Create header
    const dapContract = Schema.create.dapcontract(DashPay);

    const dapId = doubleSha256(cbor.encodeCanonical(dapContract.dapcontract));
    const { stpacket: packet } = Schema.create.stpacket(dapContract, dapId, '');

    const header = await createSTHeader(userId, privateKeyString, packet);

    const options = {
      seeds: [{ ip: process.env.DAPI_CLIENT_SEEDS }],
    };
    const dapi = new DAPIClient(options, 3000);

    await dapi.sendRawTransition(
      header.serialize(),
      Schema.serialize.encode(packet).toString('hex'),
    );

    await timeout(5000);// await dapi.generate(1);

    const newContract = await dapi.fetchDapContract(dapId);

    console.log(newContract);
  });
});
