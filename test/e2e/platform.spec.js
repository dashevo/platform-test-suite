const {
  PrivateKey,
} = require('@dashevo/dashcore-lib');

const Dash = require('dash');
const DAPIClient = require('@dashevo/dapi-client');

const Identity = require('@dashevo/dpp/lib/identity/Identity');

const fundAddress = require('../../lib/test/fundAddress');

describe('e2e', () => {
  describe('Platform', function platform() {
    this.timeout(950000);

    before(async () => {});

    after(async () => {});

    describe('Identity', () => {
      it('should fail to create an identity if output was not found');
      it('should create an identity');
      it('should fail to create an identity with the same first public key');
      it('should be able to get newly created identity');
      it('should be able to get newly created identity by it\'s first public key');
      it('should be able to get newly created identity id by it\'s first public key');
    });

    describe('Data Contract', () => {
      it('should fail to create new data contract with invalid data');
      it('should fail to create new data contract with unknown owner');
      it('should create new data contract with previously created identity as an owner');
      it('should be able to get newly created data contract');
    });

    describe('Document', () => {
      it('should fail to create new document with an unknown type');
      it('should fail to create new document with invalid data');
      it('should be able to create new document');
    });

    describe('Credits', () => {
      it('should fail to create more documents if there are no more credits');
      // TODO: maybe there should be failed top-up attempt
      it('should be able to top-up credit balance');
      it('should be able to create more documents after the top-up');
    });
  });
});
