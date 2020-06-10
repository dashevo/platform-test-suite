describe('DPNS', () => {
  // Use https://github.com/mochajs/mocha/issues/2894#issuecomment-492979837

  it('should exists');

  describe('DPNS owner', () => {
    // generate a random one which will be used in tests above
    // skip if DPNS owner private key is not passed and use `dash` in tests above
    it('should be able to register a TLD');
    it('should not be able to update domain');
    it('should not be able to delete domain');
  });

  describe('Any Identity', () => {
    it('should not be able to register TLD');
    it('should be able to register a second level domain');
    it('should not be able to register a subdomain for parent domain which is not exist');
    it('should be able to search a domain');
    it('should be able to resolve domain by it\'s record');
    it('should not be able to update domain');
    it('should not be able to delete domain');
  });
});
