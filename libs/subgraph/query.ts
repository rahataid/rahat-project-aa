export const getBeneficiaryAdded = ({
  first,
  skip,
}: {
  first: number;
  skip: number;
}) => ({
  query: `query GetBeneficiaryAdded {\n  benTokensAssigneds(first: ${first}, skip: ${skip}, orderBy: blockNumber, orderDirection: desc) {\n    id\n    beneficiary\n    amount\n    transactionHash\n    blockTimestamp\n  }\n}`,
  operationName: 'GetBeneficiaryAdded',
});
