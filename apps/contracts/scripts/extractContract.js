const fs = require('fs');

const contractName = [
  //   'ERC2771Forwarder',
  'AAProject',
  'AccessManager',
  'RahatDonor',
  'RahatToken',
];

//Read build files
const readAllFiles = () => {
  const buildFilesPath = `${__dirname}/../build/artifacts/src/contracts`;
  const contractBuild = [];
  for (const contract of contractName) {
    const contractJson = `${buildFilesPath}/${contract}.sol/${contract}.json`;
    const content = JSON.parse(fs.readFileSync(contractJson, 'utf8'));
    contractBuild.push({
      name: contract,
      content,
    });
  }
  return contractBuild;
};

//generate standard json files from build-info files
const main = async () => {
  const contractFiles = readAllFiles();
  if (!fs.existsSync(`${__dirname}/contracts-json`)) {
    fs.mkdirSync(`${__dirname}/contracts-json`);
  }
  for (const cf of contractFiles) {
    fs.writeFileSync(
      `${__dirname}/contracts-json/${cf.name}.json`,
      JSON.stringify(cf.content, null, 2)
    );
    console.log(`JSON file generated for ${cf.name}`);
  }
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
