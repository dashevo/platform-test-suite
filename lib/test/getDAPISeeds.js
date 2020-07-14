function getDAPISeeds() {
  return process.env.DAPI_SEED
    .split(',')
    .map((seed) => {
      const [host, port] = seed.split(':');

      return {
        host,
        httpPort: port,
        grpcPort: port,
      };
    });
}

module.exports = getDAPISeeds;
