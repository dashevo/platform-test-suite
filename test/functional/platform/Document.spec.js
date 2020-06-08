describe('Platform', function platform() {
  this.timeout(950000);

  let dapiClient;

  let identityPrivateKey;
  let identityAddress;

  before(async () => {
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
    });

    identityPrivateKey = new PrivateKey();
    identityAddress = identityPrivateKey.toAddress();

    await fundAddress(dapiClient, faucetAddress, faucetPrivateKey, identityAddress, 10);
  });

  describe('Document', () => {
    it('should fail to create new document with an unknown type');
    it('should fail to create new document with invalid data');
    it('should be able to create new document');
  });
});
