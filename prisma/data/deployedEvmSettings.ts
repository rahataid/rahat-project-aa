// Note: this file is only relevant for Chain EVM and for local setup.
// DO NOT USE THIS IN PRODUCTION ENVIRONMENT. This is only for testing and development purposes.

export const CONTRACT = {
  INKIND: {
    ABI: [
      {
        type: 'constructor',
        inputs: [
          {
            name: '_defaultToken',
            type: 'address',
            internalType: 'address',
          },
          {
            name: '_accessManager',
            type: 'address',
            internalType: 'address',
          },
        ],
        stateMutability: 'nonpayable',
      },
      {
        name: 'AccessManagedInvalidAuthority',
        type: 'error',
        inputs: [
          {
            name: 'authority',
            type: 'address',
            internalType: 'address',
          },
        ],
      },
      {
        name: 'AccessManagedRequiredDelay',
        type: 'error',
        inputs: [
          {
            name: 'caller',
            type: 'address',
            internalType: 'address',
          },
          {
            name: 'delay',
            type: 'uint32',
            internalType: 'uint32',
          },
        ],
      },
      {
        name: 'AccessManagedUnauthorized',
        type: 'error',
        inputs: [
          {
            name: 'caller',
            type: 'address',
            internalType: 'address',
          },
        ],
      },
      {
        name: 'AuthorityUpdated',
        type: 'event',
        inputs: [
          {
            name: 'authority',
            type: 'address',
            indexed: false,
            internalType: 'address',
          },
        ],
        anonymous: false,
      },
      {
        name: 'InkindRedeemed',
        type: 'event',
        inputs: [
          {
            name: 'inkind',
            type: 'bytes16',
            indexed: true,
            internalType: 'bytes16',
          },
          {
            name: 'vendor',
            type: 'address',
            indexed: true,
            internalType: 'address',
          },
          {
            name: 'beneficiary',
            type: 'address',
            indexed: true,
            internalType: 'address',
          },
        ],
        anonymous: false,
      },
      {
        name: 'authority',
        type: 'function',
        inputs: [],
        outputs: [
          {
            name: '',
            type: 'address',
            internalType: 'address',
          },
        ],
        stateMutability: 'view',
      },
      {
        name: 'beneficiaryVendors',
        type: 'function',
        inputs: [
          {
            name: '',
            type: 'address',
            internalType: 'address',
          },
        ],
        outputs: [
          {
            name: '',
            type: 'address',
            internalType: 'address',
          },
        ],
        stateMutability: 'view',
      },
      {
        name: 'defaultToken',
        type: 'function',
        inputs: [],
        outputs: [
          {
            name: '',
            type: 'address',
            internalType: 'address',
          },
        ],
        stateMutability: 'view',
      },
      {
        name: 'isConsumingScheduledOp',
        type: 'function',
        inputs: [],
        outputs: [
          {
            name: '',
            type: 'bytes4',
            internalType: 'bytes4',
          },
        ],
        stateMutability: 'view',
      },
      {
        name: 'redeemInkind',
        type: 'function',
        inputs: [
          {
            name: '_inkind',
            type: 'bytes16[]',
            internalType: 'bytes16[]',
          },
          {
            name: '_vendor',
            type: 'address',
            internalType: 'address',
          },
          {
            name: '_beneficiary',
            type: 'address',
            internalType: 'address',
          },
        ],
        outputs: [],
        stateMutability: 'nonpayable',
      },
      {
        name: 'redeemedInkind',
        type: 'function',
        inputs: [
          {
            name: '',
            type: 'bytes16',
            internalType: 'bytes16',
          },
        ],
        outputs: [
          {
            name: '',
            type: 'address',
            internalType: 'address',
          },
        ],
        stateMutability: 'view',
      },
      {
        name: 'setAuthority',
        type: 'function',
        inputs: [
          {
            name: 'newAuthority',
            type: 'address',
            internalType: 'address',
          },
        ],
        outputs: [],
        stateMutability: 'nonpayable',
      },
    ],
  },
  AAPROJECT: {
    ABI: [
      {
        TYPE: 'constructor',
        INPUTS: [
          {
            NAME: '_name',
            TYPE: 'string',
            INTERNALTYPE: 'string',
          },
          {
            NAME: '_defaultToken',
            TYPE: 'address',
            INTERNALTYPE: 'address',
          },
          {
            NAME: '_forwarder',
            TYPE: 'address',
            INTERNALTYPE: 'address',
          },
          {
            NAME: '_accessManager',
            TYPE: 'address',
            INTERNALTYPE: 'address',
          },
          {
            NAME: '_triggerManager',
            TYPE: 'address',
            INTERNALTYPE: 'address',
          },
        ],
        STATEMUTABILITY: 'nonpayable',
      },
      {
        NAME: 'AccessManagedInvalidAuthority',
        TYPE: 'error',
        INPUTS: [
          {
            NAME: 'authority',
            TYPE: 'address',
            INTERNALTYPE: 'address',
          },
        ],
      },
      {
        NAME: 'AccessManagedRequiredDelay',
        TYPE: 'error',
        INPUTS: [
          {
            NAME: 'caller',
            TYPE: 'address',
            INTERNALTYPE: 'address',
          },
          {
            NAME: 'delay',
            TYPE: 'uint32',
            INTERNALTYPE: 'uint32',
          },
        ],
      },
      {
        NAME: 'AccessManagedUnauthorized',
        TYPE: 'error',
        INPUTS: [
          {
            NAME: 'caller',
            TYPE: 'address',
            INTERNALTYPE: 'address',
          },
        ],
      },
      {
        NAME: 'AddressEmptyCode',
        TYPE: 'error',
        INPUTS: [
          {
            NAME: 'target',
            TYPE: 'address',
            INTERNALTYPE: 'address',
          },
        ],
      },
      {
        NAME: 'FailedInnerCall',
        TYPE: 'error',
        INPUTS: [],
      },
      {
        NAME: 'AuthorityUpdated',
        TYPE: 'event',
        INPUTS: [
          {
            NAME: 'authority',
            TYPE: 'address',
            INDEXED: false,
            INTERNALTYPE: 'address',
          },
        ],
        ANONYMOUS: false,
      },
      {
        NAME: 'BenTokensAssigned',
        TYPE: 'event',
        INPUTS: [
          {
            NAME: 'beneficiary',
            TYPE: 'address',
            INDEXED: true,
            INTERNALTYPE: 'address',
          },
          {
            NAME: 'amount',
            TYPE: 'uint256',
            INDEXED: true,
            INTERNALTYPE: 'uint256',
          },
        ],
        ANONYMOUS: false,
      },
      {
        NAME: 'BeneficiaryAdded',
        TYPE: 'event',
        INPUTS: [
          {
            NAME: '',
            TYPE: 'address',
            INDEXED: true,
            INTERNALTYPE: 'address',
          },
        ],
        ANONYMOUS: false,
      },
      {
        NAME: 'BeneficiaryRemoved',
        TYPE: 'event',
        INPUTS: [
          {
            NAME: '',
            TYPE: 'address',
            INDEXED: true,
            INTERNALTYPE: 'address',
          },
        ],
        ANONYMOUS: false,
      },
      {
        NAME: 'CashTokenTransferred',
        TYPE: 'event',
        INPUTS: [
          {
            NAME: 'vendor',
            TYPE: 'address',
            INDEXED: true,
            INTERNALTYPE: 'address',
          },
          {
            NAME: 'beneficiary',
            TYPE: 'address',
            INDEXED: true,
            INTERNALTYPE: 'address',
          },
          {
            NAME: 'amount',
            TYPE: 'uint256',
            INDEXED: true,
            INTERNALTYPE: 'uint256',
          },
        ],
        ANONYMOUS: false,
      },
      {
        NAME: 'ClaimAssigned',
        TYPE: 'event',
        INPUTS: [
          {
            NAME: 'beneficiary',
            TYPE: 'address',
            INDEXED: true,
            INTERNALTYPE: 'address',
          },
          {
            NAME: 'token',
            TYPE: 'address',
            INDEXED: true,
            INTERNALTYPE: 'address',
          },
          {
            NAME: 'assigner',
            TYPE: 'address',
            INDEXED: true,
            INTERNALTYPE: 'address',
          },
        ],
        ANONYMOUS: false,
      },
      {
        NAME: 'TokenBudgetDecrease',
        TYPE: 'event',
        INPUTS: [
          {
            NAME: 'tokenAddress',
            TYPE: 'address',
            INDEXED: true,
            INTERNALTYPE: 'address',
          },
          {
            NAME: 'amount',
            TYPE: 'uint256',
            INDEXED: false,
            INTERNALTYPE: 'uint256',
          },
        ],
        ANONYMOUS: false,
      },
      {
        NAME: 'TokenBudgetIncrease',
        TYPE: 'event',
        INPUTS: [
          {
            NAME: 'tokenAddress',
            TYPE: 'address',
            INDEXED: true,
            INTERNALTYPE: 'address',
          },
          {
            NAME: 'amount',
            TYPE: 'uint256',
            INDEXED: false,
            INTERNALTYPE: 'uint256',
          },
        ],
        ANONYMOUS: false,
      },
      {
        NAME: 'TokenReceived',
        TYPE: 'event',
        INPUTS: [
          {
            NAME: 'token',
            TYPE: 'address',
            INDEXED: true,
            INTERNALTYPE: 'address',
          },
          {
            NAME: 'from',
            TYPE: 'address',
            INDEXED: true,
            INTERNALTYPE: 'address',
          },
          {
            NAME: 'amount',
            TYPE: 'uint256',
            INDEXED: false,
            INTERNALTYPE: 'uint256',
          },
        ],
        ANONYMOUS: false,
      },
      {
        NAME: 'TokenRegistered',
        TYPE: 'event',
        INPUTS: [
          {
            NAME: 'tokenAddress',
            TYPE: 'address',
            INDEXED: true,
            INTERNALTYPE: 'address',
          },
        ],
        ANONYMOUS: false,
      },
      {
        NAME: 'TokenTransfer',
        TYPE: 'event',
        INPUTS: [
          {
            NAME: 'token',
            TYPE: 'address',
            INDEXED: true,
            INTERNALTYPE: 'address',
          },
          {
            NAME: 'to',
            TYPE: 'address',
            INDEXED: true,
            INTERNALTYPE: 'address',
          },
          {
            NAME: 'amount',
            TYPE: 'uint256',
            INDEXED: false,
            INTERNALTYPE: 'uint256',
          },
        ],
        ANONYMOUS: false,
      },
      {
        NAME: 'TokenTransferred',
        TYPE: 'event',
        INPUTS: [
          {
            NAME: 'beneficiary',
            TYPE: 'address',
            INDEXED: true,
            INTERNALTYPE: 'address',
          },
          {
            NAME: 'vendor',
            TYPE: 'address',
            INDEXED: true,
            INTERNALTYPE: 'address',
          },
          {
            NAME: 'amount',
            TYPE: 'uint256',
            INDEXED: true,
            INTERNALTYPE: 'uint256',
          },
        ],
        ANONYMOUS: false,
      },
      {
        NAME: 'VendorUpdated',
        TYPE: 'event',
        INPUTS: [
          {
            NAME: 'vendorAddress',
            TYPE: 'address',
            INDEXED: true,
            INTERNALTYPE: 'address',
          },
          {
            NAME: 'status',
            TYPE: 'bool',
            INDEXED: false,
            INTERNALTYPE: 'bool',
          },
        ],
        ANONYMOUS: false,
      },
      {
        NAME: 'IID_RAHAT_PROJECT',
        TYPE: 'function',
        INPUTS: [],
        OUTPUTS: [
          {
            NAME: '',
            TYPE: 'bytes4',
            INTERNALTYPE: 'bytes4',
          },
        ],
        STATEMUTABILITY: 'view',
      },
      {
        NAME: 'TriggerManager',
        TYPE: 'function',
        INPUTS: [],
        OUTPUTS: [
          {
            NAME: '',
            TYPE: 'address',
            INTERNALTYPE: 'contract ITriggerManager',
          },
        ],
        STATEMUTABILITY: 'view',
      },
      {
        NAME: 'addBeneficiary',
        TYPE: 'function',
        INPUTS: [
          {
            NAME: '_address',
            TYPE: 'address',
            INTERNALTYPE: 'address',
          },
        ],
        OUTPUTS: [],
        STATEMUTABILITY: 'nonpayable',
      },
      {
        NAME: 'assignClaims',
        TYPE: 'function',
        INPUTS: [
          {
            NAME: '_beneficiary',
            TYPE: 'address',
            INTERNALTYPE: 'address',
          },
          {
            NAME: '_tokenAssigned',
            TYPE: 'uint256',
            INTERNALTYPE: 'uint256',
          },
        ],
        OUTPUTS: [],
        STATEMUTABILITY: 'nonpayable',
      },
      {
        NAME: 'assignTokenToBeneficiary',
        TYPE: 'function',
        INPUTS: [
          {
            NAME: '_address',
            TYPE: 'address',
            INTERNALTYPE: 'address',
          },
          {
            NAME: '_amount',
            TYPE: 'uint256',
            INTERNALTYPE: 'uint256',
          },
        ],
        OUTPUTS: [],
        STATEMUTABILITY: 'nonpayable',
      },
      {
        NAME: 'authority',
        TYPE: 'function',
        INPUTS: [],
        OUTPUTS: [
          {
            NAME: '',
            TYPE: 'address',
            INTERNALTYPE: 'address',
          },
        ],
        STATEMUTABILITY: 'view',
      },
      {
        NAME: 'benCashTokens',
        TYPE: 'function',
        INPUTS: [
          {
            NAME: '',
            TYPE: 'address',
            INTERNALTYPE: 'address',
          },
        ],
        OUTPUTS: [
          {
            NAME: '',
            TYPE: 'uint256',
            INTERNALTYPE: 'uint256',
          },
        ],
        STATEMUTABILITY: 'view',
      },
      {
        NAME: 'benTokens',
        TYPE: 'function',
        INPUTS: [
          {
            NAME: '',
            TYPE: 'address',
            INTERNALTYPE: 'address',
          },
        ],
        OUTPUTS: [
          {
            NAME: '',
            TYPE: 'uint256',
            INTERNALTYPE: 'uint256',
          },
        ],
        STATEMUTABILITY: 'view',
      },
      {
        NAME: 'beneficiaryCount',
        TYPE: 'function',
        INPUTS: [],
        OUTPUTS: [
          {
            NAME: '',
            TYPE: 'uint256',
            INTERNALTYPE: 'uint256',
          },
        ],
        STATEMUTABILITY: 'view',
      },
      {
        NAME: 'checkVendorStatus',
        TYPE: 'function',
        INPUTS: [
          {
            NAME: '_address',
            TYPE: 'address',
            INTERNALTYPE: 'address',
          },
        ],
        OUTPUTS: [
          {
            NAME: '_vendorStatus',
            TYPE: 'bool',
            INTERNALTYPE: 'bool',
          },
        ],
        STATEMUTABILITY: 'view',
      },
      {
        NAME: 'defaultToken',
        TYPE: 'function',
        INPUTS: [],
        OUTPUTS: [
          {
            NAME: '',
            TYPE: 'address',
            INTERNALTYPE: 'address',
          },
        ],
        STATEMUTABILITY: 'view',
      },
      {
        NAME: 'increaseTokenBudget',
        TYPE: 'function',
        INPUTS: [
          {
            NAME: '_tokenAddress',
            TYPE: 'address',
            INTERNALTYPE: 'address',
          },
          {
            NAME: '_amount',
            TYPE: 'uint256',
            INTERNALTYPE: 'uint256',
          },
        ],
        OUTPUTS: [],
        STATEMUTABILITY: 'nonpayable',
      },
      {
        NAME: 'isBeneficiary',
        TYPE: 'function',
        INPUTS: [
          {
            NAME: '_address',
            TYPE: 'address',
            INTERNALTYPE: 'address',
          },
        ],
        OUTPUTS: [
          {
            NAME: '',
            TYPE: 'bool',
            INTERNALTYPE: 'bool',
          },
        ],
        STATEMUTABILITY: 'view',
      },
      {
        NAME: 'isConsumingScheduledOp',
        TYPE: 'function',
        INPUTS: [],
        OUTPUTS: [
          {
            NAME: '',
            TYPE: 'bytes4',
            INTERNALTYPE: 'bytes4',
          },
        ],
        STATEMUTABILITY: 'view',
      },
      {
        NAME: 'isTrustedForwarder',
        TYPE: 'function',
        INPUTS: [
          {
            NAME: 'forwarder',
            TYPE: 'address',
            INTERNALTYPE: 'address',
          },
        ],
        OUTPUTS: [
          {
            NAME: '',
            TYPE: 'bool',
            INTERNALTYPE: 'bool',
          },
        ],
        STATEMUTABILITY: 'view',
      },
      {
        NAME: 'multicall',
        TYPE: 'function',
        INPUTS: [
          {
            NAME: 'data',
            TYPE: 'bytes[]',
            INTERNALTYPE: 'bytes[]',
          },
        ],
        OUTPUTS: [
          {
            NAME: 'results',
            TYPE: 'bytes[]',
            INTERNALTYPE: 'bytes[]',
          },
        ],
        STATEMUTABILITY: 'nonpayable',
      },
      {
        NAME: 'name',
        TYPE: 'function',
        INPUTS: [],
        OUTPUTS: [
          {
            NAME: '',
            TYPE: 'string',
            INTERNALTYPE: 'string',
          },
        ],
        STATEMUTABILITY: 'view',
      },
      {
        NAME: 'registeredTokens',
        TYPE: 'function',
        INPUTS: [
          {
            NAME: '',
            TYPE: 'address',
            INTERNALTYPE: 'address',
          },
        ],
        OUTPUTS: [
          {
            NAME: '',
            TYPE: 'bool',
            INTERNALTYPE: 'bool',
          },
        ],
        STATEMUTABILITY: 'view',
      },
      {
        NAME: 'removeBeneficiary',
        TYPE: 'function',
        INPUTS: [
          {
            NAME: '_address',
            TYPE: 'address',
            INTERNALTYPE: 'address',
          },
        ],
        OUTPUTS: [],
        STATEMUTABILITY: 'nonpayable',
      },
      {
        NAME: 'setAuthority',
        TYPE: 'function',
        INPUTS: [
          {
            NAME: 'newAuthority',
            TYPE: 'address',
            INTERNALTYPE: 'address',
          },
        ],
        OUTPUTS: [],
        STATEMUTABILITY: 'nonpayable',
      },
      {
        NAME: 'supportsInterface',
        TYPE: 'function',
        INPUTS: [
          {
            NAME: 'interfaceId',
            TYPE: 'bytes4',
            INTERNALTYPE: 'bytes4',
          },
        ],
        OUTPUTS: [
          {
            NAME: '',
            TYPE: 'bool',
            INTERNALTYPE: 'bool',
          },
        ],
        STATEMUTABILITY: 'view',
      },
      {
        NAME: 'tokenBudget',
        TYPE: 'function',
        INPUTS: [
          {
            NAME: '_tokenAddress',
            TYPE: 'address',
            INTERNALTYPE: 'address',
          },
        ],
        OUTPUTS: [
          {
            NAME: '',
            TYPE: 'uint256',
            INTERNALTYPE: 'uint256',
          },
        ],
        STATEMUTABILITY: 'view',
      },
      {
        NAME: 'totalClaimsAssigned',
        TYPE: 'function',
        INPUTS: [],
        OUTPUTS: [
          {
            NAME: '_totalClaims',
            TYPE: 'uint256',
            INTERNALTYPE: 'uint256',
          },
        ],
        STATEMUTABILITY: 'view',
      },
      {
        NAME: 'transferTokenToVendor',
        TYPE: 'function',
        INPUTS: [
          {
            NAME: '_benAddress',
            TYPE: 'address',
            INTERNALTYPE: 'address',
          },
          {
            NAME: '_vendorAddress',
            TYPE: 'address',
            INTERNALTYPE: 'address',
          },
          {
            NAME: '_amount',
            TYPE: 'uint256',
            INTERNALTYPE: 'uint256',
          },
        ],
        OUTPUTS: [],
        STATEMUTABILITY: 'nonpayable',
      },
      {
        NAME: 'transferTokenToVendorForCashToken',
        TYPE: 'function',
        INPUTS: [
          {
            NAME: '_benAddress',
            TYPE: 'address',
            INTERNALTYPE: 'address',
          },
          {
            NAME: '_vendorAddress',
            TYPE: 'address',
            INTERNALTYPE: 'address',
          },
          {
            NAME: '_cashTokenAddress',
            TYPE: 'address',
            INTERNALTYPE: 'address',
          },
          {
            NAME: '_amount',
            TYPE: 'uint256',
            INTERNALTYPE: 'uint256',
          },
        ],
        OUTPUTS: [],
        STATEMUTABILITY: 'nonpayable',
      },
      {
        NAME: 'trustedForwarder',
        TYPE: 'function',
        INPUTS: [],
        OUTPUTS: [
          {
            NAME: '',
            TYPE: 'address',
            INTERNALTYPE: 'address',
          },
        ],
        STATEMUTABILITY: 'view',
      },
    ],
    ADDRESS: '0xDe80ec1423Ea51d80D9c1400E45DbcAfEeD03176',
  },
  RAHATDONOR: {
    ABI: [
      {
        TYPE: 'constructor',
        INPUTS: [
          {
            NAME: '_admin',
            TYPE: 'address',
            INTERNALTYPE: 'address',
          },
          {
            NAME: '_accessManager',
            TYPE: 'address',
            INTERNALTYPE: 'address',
          },
        ],
        STATEMUTABILITY: 'nonpayable',
      },
      {
        NAME: 'AccessManagedInvalidAuthority',
        TYPE: 'error',
        INPUTS: [
          {
            NAME: 'authority',
            TYPE: 'address',
            INTERNALTYPE: 'address',
          },
        ],
      },
      {
        NAME: 'AccessManagedRequiredDelay',
        TYPE: 'error',
        INPUTS: [
          {
            NAME: 'caller',
            TYPE: 'address',
            INTERNALTYPE: 'address',
          },
          {
            NAME: 'delay',
            TYPE: 'uint32',
            INTERNALTYPE: 'uint32',
          },
        ],
      },
      {
        NAME: 'AccessManagedUnauthorized',
        TYPE: 'error',
        INPUTS: [
          {
            NAME: 'caller',
            TYPE: 'address',
            INTERNALTYPE: 'address',
          },
        ],
      },
      {
        NAME: 'AddressEmptyCode',
        TYPE: 'error',
        INPUTS: [
          {
            NAME: 'target',
            TYPE: 'address',
            INTERNALTYPE: 'address',
          },
        ],
      },
      {
        NAME: 'FailedInnerCall',
        TYPE: 'error',
        INPUTS: [],
      },
      {
        NAME: 'AuthorityUpdated',
        TYPE: 'event',
        INPUTS: [
          {
            NAME: 'authority',
            TYPE: 'address',
            INDEXED: false,
            INTERNALTYPE: 'address',
          },
        ],
        ANONYMOUS: false,
      },
      {
        NAME: 'OwnerAdded',
        TYPE: 'event',
        INPUTS: [
          {
            NAME: '',
            TYPE: 'address',
            INDEXED: true,
            INTERNALTYPE: 'address',
          },
        ],
        ANONYMOUS: false,
      },
      {
        NAME: 'OwnerRemoved',
        TYPE: 'event',
        INPUTS: [
          {
            NAME: '',
            TYPE: 'address',
            INDEXED: true,
            INTERNALTYPE: 'address',
          },
        ],
        ANONYMOUS: false,
      },
      {
        NAME: 'TokenCreated',
        TYPE: 'event',
        INPUTS: [
          {
            NAME: 'tokenAddress',
            TYPE: 'address',
            INDEXED: true,
            INTERNALTYPE: 'address',
          },
        ],
        ANONYMOUS: false,
      },
      {
        NAME: 'TokenMintedAndApproved',
        TYPE: 'event',
        INPUTS: [
          {
            NAME: 'projectTokenAddress',
            TYPE: 'address',
            INDEXED: true,
            INTERNALTYPE: 'address',
          },
          {
            NAME: 'projectTokenapproveAddress',
            TYPE: 'address',
            INDEXED: true,
            INTERNALTYPE: 'address',
          },
          {
            NAME: 'cashTokenAddress',
            TYPE: 'address',
            INDEXED: true,
            INTERNALTYPE: 'address',
          },
          {
            NAME: 'cashTokenReciever',
            TYPE: 'address',
            INDEXED: false,
            INTERNALTYPE: 'address',
          },
          {
            NAME: 'amount',
            TYPE: 'uint256',
            INDEXED: false,
            INTERNALTYPE: 'uint256',
          },
        ],
        ANONYMOUS: false,
      },
      {
        NAME: 'IID_RAHAT_DONOR',
        TYPE: 'function',
        INPUTS: [],
        OUTPUTS: [
          {
            NAME: '',
            TYPE: 'bytes4',
            INTERNALTYPE: 'bytes4',
          },
        ],
        STATEMUTABILITY: 'view',
      },
      {
        NAME: 'RahatTreasury',
        TYPE: 'function',
        INPUTS: [],
        OUTPUTS: [
          {
            NAME: '',
            TYPE: 'address',
            INTERNALTYPE: 'contract IRahatTreasury',
          },
        ],
        STATEMUTABILITY: 'view',
      },
      {
        NAME: '_registeredProject',
        TYPE: 'function',
        INPUTS: [
          {
            NAME: '',
            TYPE: 'address',
            INTERNALTYPE: 'address',
          },
        ],
        OUTPUTS: [
          {
            NAME: '',
            TYPE: 'bool',
            INTERNALTYPE: 'bool',
          },
        ],
        STATEMUTABILITY: 'view',
      },
      {
        NAME: 'addOwner',
        TYPE: 'function',
        INPUTS: [
          {
            NAME: '_address',
            TYPE: 'address',
            INTERNALTYPE: 'address',
          },
        ],
        OUTPUTS: [
          {
            NAME: 'success',
            TYPE: 'bool',
            INTERNALTYPE: 'bool',
          },
        ],
        STATEMUTABILITY: 'nonpayable',
      },
      {
        NAME: 'addTokenOwner',
        TYPE: 'function',
        INPUTS: [
          {
            NAME: '_token',
            TYPE: 'address',
            INTERNALTYPE: 'address',
          },
          {
            NAME: '_ownerAddress',
            TYPE: 'address',
            INTERNALTYPE: 'address',
          },
        ],
        OUTPUTS: [],
        STATEMUTABILITY: 'nonpayable',
      },
      {
        NAME: 'approveToken',
        TYPE: 'function',
        INPUTS: [
          {
            NAME: '_token',
            TYPE: 'address',
            INTERNALTYPE: 'address',
          },
          {
            NAME: '_spender',
            TYPE: 'address',
            INTERNALTYPE: 'address',
          },
          {
            NAME: '_amount',
            TYPE: 'uint256',
            INTERNALTYPE: 'uint256',
          },
        ],
        OUTPUTS: [],
        STATEMUTABILITY: 'nonpayable',
      },
      {
        NAME: 'authority',
        TYPE: 'function',
        INPUTS: [],
        OUTPUTS: [
          {
            NAME: '',
            TYPE: 'address',
            INTERNALTYPE: 'address',
          },
        ],
        STATEMUTABILITY: 'view',
      },
      {
        NAME: 'changeCashTokenOwnerShip',
        TYPE: 'function',
        INPUTS: [
          {
            NAME: '_cashTokenAddress',
            TYPE: 'address',
            INTERNALTYPE: 'address',
          },
          {
            NAME: '_newOwner',
            TYPE: 'address',
            INTERNALTYPE: 'address',
          },
        ],
        OUTPUTS: [],
        STATEMUTABILITY: 'nonpayable',
      },
      {
        NAME: 'claimToken',
        TYPE: 'function',
        INPUTS: [
          {
            NAME: '_token',
            TYPE: 'address',
            INTERNALTYPE: 'address',
          },
          {
            NAME: '_from',
            TYPE: 'address',
            INTERNALTYPE: 'address',
          },
          {
            NAME: '_amount',
            TYPE: 'uint256',
            INTERNALTYPE: 'uint256',
          },
        ],
        OUTPUTS: [],
        STATEMUTABILITY: 'nonpayable',
      },
      {
        NAME: 'getAllowanceAndBalance',
        TYPE: 'function',
        INPUTS: [
          {
            NAME: '_token',
            TYPE: 'address',
            INTERNALTYPE: 'address',
          },
          {
            NAME: '_from',
            TYPE: 'address',
            INTERNALTYPE: 'address',
          },
        ],
        OUTPUTS: [
          {
            NAME: 'allowance',
            TYPE: 'uint256',
            INTERNALTYPE: 'uint256',
          },
          {
            NAME: 'balance',
            TYPE: 'uint256',
            INTERNALTYPE: 'uint256',
          },
        ],
        STATEMUTABILITY: 'view',
      },
      {
        NAME: 'isConsumingScheduledOp',
        TYPE: 'function',
        INPUTS: [],
        OUTPUTS: [
          {
            NAME: '',
            TYPE: 'bytes4',
            INTERNALTYPE: 'bytes4',
          },
        ],
        STATEMUTABILITY: 'view',
      },
      {
        NAME: 'isOwner',
        TYPE: 'function',
        INPUTS: [
          {
            NAME: '_address',
            TYPE: 'address',
            INTERNALTYPE: 'address',
          },
        ],
        OUTPUTS: [
          {
            NAME: '',
            TYPE: 'bool',
            INTERNALTYPE: 'bool',
          },
        ],
        STATEMUTABILITY: 'view',
      },
      {
        NAME: 'listOwners',
        TYPE: 'function',
        INPUTS: [],
        OUTPUTS: [
          {
            NAME: '',
            TYPE: 'address[]',
            INTERNALTYPE: 'address[]',
          },
        ],
        STATEMUTABILITY: 'view',
      },
      {
        NAME: 'mintToken',
        TYPE: 'function',
        INPUTS: [
          {
            NAME: '_token',
            TYPE: 'address',
            INTERNALTYPE: 'address',
          },
          {
            NAME: '_amount',
            TYPE: 'uint256',
            INTERNALTYPE: 'uint256',
          },
        ],
        OUTPUTS: [],
        STATEMUTABILITY: 'nonpayable',
      },
      {
        NAME: 'mintTokens',
        TYPE: 'function',
        INPUTS: [
          {
            NAME: '_projectToken',
            TYPE: 'address',
            INTERNALTYPE: 'address',
          },
          {
            NAME: '_projectAddress',
            TYPE: 'address',
            INTERNALTYPE: 'address',
          },
          {
            NAME: '_cashToken',
            TYPE: 'address',
            INTERNALTYPE: 'address',
          },
          {
            NAME: '_cashTokenReciever',
            TYPE: 'address',
            INTERNALTYPE: 'address',
          },
          {
            NAME: '_amount',
            TYPE: 'uint256',
            INTERNALTYPE: 'uint256',
          },
        ],
        OUTPUTS: [
          {
            NAME: '',
            TYPE: 'bool',
            INTERNALTYPE: 'bool',
          },
        ],
        STATEMUTABILITY: 'nonpayable',
      },
      {
        NAME: 'multicall',
        TYPE: 'function',
        INPUTS: [
          {
            NAME: 'data',
            TYPE: 'bytes[]',
            INTERNALTYPE: 'bytes[]',
          },
        ],
        OUTPUTS: [
          {
            NAME: 'results',
            TYPE: 'bytes[]',
            INTERNALTYPE: 'bytes[]',
          },
        ],
        STATEMUTABILITY: 'nonpayable',
      },
      {
        NAME: 'ownerCount',
        TYPE: 'function',
        INPUTS: [],
        OUTPUTS: [
          {
            NAME: '',
            TYPE: 'uint256',
            INTERNALTYPE: 'uint256',
          },
        ],
        STATEMUTABILITY: 'view',
      },
      {
        NAME: 'registerProject',
        TYPE: 'function',
        INPUTS: [
          {
            NAME: '_projectAddress',
            TYPE: 'address',
            INTERNALTYPE: 'address',
          },
          {
            NAME: 'status',
            TYPE: 'bool',
            INTERNALTYPE: 'bool',
          },
        ],
        OUTPUTS: [],
        STATEMUTABILITY: 'nonpayable',
      },
      {
        NAME: 'removeOwner',
        TYPE: 'function',
        INPUTS: [
          {
            NAME: '_address',
            TYPE: 'address',
            INTERNALTYPE: 'address',
          },
        ],
        OUTPUTS: [
          {
            NAME: 'success',
            TYPE: 'bool',
            INTERNALTYPE: 'bool',
          },
        ],
        STATEMUTABILITY: 'nonpayable',
      },
      {
        NAME: 'setAuthority',
        TYPE: 'function',
        INPUTS: [
          {
            NAME: 'newAuthority',
            TYPE: 'address',
            INTERNALTYPE: 'address',
          },
        ],
        OUTPUTS: [],
        STATEMUTABILITY: 'nonpayable',
      },
      {
        NAME: 'supportsInterface',
        TYPE: 'function',
        INPUTS: [
          {
            NAME: 'interfaceId',
            TYPE: 'bytes4',
            INTERNALTYPE: 'bytes4',
          },
        ],
        OUTPUTS: [
          {
            NAME: '',
            TYPE: 'bool',
            INTERNALTYPE: 'bool',
          },
        ],
        STATEMUTABILITY: 'view',
      },
      {
        NAME: 'tokenToDollarValue',
        TYPE: 'function',
        INPUTS: [
          {
            NAME: '',
            TYPE: 'uint256',
            INTERNALTYPE: 'uint256',
          },
        ],
        OUTPUTS: [
          {
            NAME: '',
            TYPE: 'uint256',
            INTERNALTYPE: 'uint256',
          },
        ],
        STATEMUTABILITY: 'view',
      },
      {
        NAME: 'transferFromToken',
        TYPE: 'function',
        INPUTS: [
          {
            NAME: '_token',
            TYPE: 'address',
            INTERNALTYPE: 'address',
          },
          {
            NAME: '_from',
            TYPE: 'address',
            INTERNALTYPE: 'address',
          },
          {
            NAME: '_to',
            TYPE: 'address',
            INTERNALTYPE: 'address',
          },
          {
            NAME: '_amount',
            TYPE: 'uint256',
            INTERNALTYPE: 'uint256',
          },
        ],
        OUTPUTS: [],
        STATEMUTABILITY: 'nonpayable',
      },
      {
        NAME: 'transferToken',
        TYPE: 'function',
        INPUTS: [
          {
            NAME: '_token',
            TYPE: 'address',
            INTERNALTYPE: 'address',
          },
          {
            NAME: '_to',
            TYPE: 'address',
            INTERNALTYPE: 'address',
          },
          {
            NAME: '_amount',
            TYPE: 'uint256',
            INTERNALTYPE: 'uint256',
          },
        ],
        OUTPUTS: [],
        STATEMUTABILITY: 'nonpayable',
      },
    ],
    ADDRESS: '0x885d6aB2c27396C2407719623eCDf60872d7EDd5',
  },
  RAHATTOKEN: {
    ABI: [
      {
        TYPE: 'constructor',
        INPUTS: [
          {
            NAME: '_forwarder',
            TYPE: 'address',
            INTERNALTYPE: 'address',
          },
          {
            NAME: '_name',
            TYPE: 'string',
            INTERNALTYPE: 'string',
          },
          {
            NAME: '_symbol',
            TYPE: 'string',
            INTERNALTYPE: 'string',
          },
          {
            NAME: '_admin',
            TYPE: 'address',
            INTERNALTYPE: 'address',
          },
          {
            NAME: '_decimals',
            TYPE: 'uint8',
            INTERNALTYPE: 'uint8',
          },
        ],
        STATEMUTABILITY: 'nonpayable',
      },
      {
        NAME: 'AddressEmptyCode',
        TYPE: 'error',
        INPUTS: [
          {
            NAME: 'target',
            TYPE: 'address',
            INTERNALTYPE: 'address',
          },
        ],
      },
      {
        NAME: 'ERC20InsufficientAllowance',
        TYPE: 'error',
        INPUTS: [
          {
            NAME: 'spender',
            TYPE: 'address',
            INTERNALTYPE: 'address',
          },
          {
            NAME: 'allowance',
            TYPE: 'uint256',
            INTERNALTYPE: 'uint256',
          },
          {
            NAME: 'needed',
            TYPE: 'uint256',
            INTERNALTYPE: 'uint256',
          },
        ],
      },
      {
        NAME: 'ERC20InsufficientBalance',
        TYPE: 'error',
        INPUTS: [
          {
            NAME: 'sender',
            TYPE: 'address',
            INTERNALTYPE: 'address',
          },
          {
            NAME: 'balance',
            TYPE: 'uint256',
            INTERNALTYPE: 'uint256',
          },
          {
            NAME: 'needed',
            TYPE: 'uint256',
            INTERNALTYPE: 'uint256',
          },
        ],
      },
      {
        NAME: 'ERC20InvalidApprover',
        TYPE: 'error',
        INPUTS: [
          {
            NAME: 'approver',
            TYPE: 'address',
            INTERNALTYPE: 'address',
          },
        ],
      },
      {
        NAME: 'ERC20InvalidReceiver',
        TYPE: 'error',
        INPUTS: [
          {
            NAME: 'receiver',
            TYPE: 'address',
            INTERNALTYPE: 'address',
          },
        ],
      },
      {
        NAME: 'ERC20InvalidSender',
        TYPE: 'error',
        INPUTS: [
          {
            NAME: 'sender',
            TYPE: 'address',
            INTERNALTYPE: 'address',
          },
        ],
      },
      {
        NAME: 'ERC20InvalidSpender',
        TYPE: 'error',
        INPUTS: [
          {
            NAME: 'spender',
            TYPE: 'address',
            INTERNALTYPE: 'address',
          },
        ],
      },
      {
        NAME: 'FailedInnerCall',
        TYPE: 'error',
        INPUTS: [],
      },
      {
        NAME: 'Approval',
        TYPE: 'event',
        INPUTS: [
          {
            NAME: 'owner',
            TYPE: 'address',
            INDEXED: true,
            INTERNALTYPE: 'address',
          },
          {
            NAME: 'spender',
            TYPE: 'address',
            INDEXED: true,
            INTERNALTYPE: 'address',
          },
          {
            NAME: 'value',
            TYPE: 'uint256',
            INDEXED: false,
            INTERNALTYPE: 'uint256',
          },
        ],
        ANONYMOUS: false,
      },
      {
        NAME: 'OwnerAdded',
        TYPE: 'event',
        INPUTS: [
          {
            NAME: '',
            TYPE: 'address',
            INDEXED: true,
            INTERNALTYPE: 'address',
          },
        ],
        ANONYMOUS: false,
      },
      {
        NAME: 'OwnerRemoved',
        TYPE: 'event',
        INPUTS: [
          {
            NAME: '',
            TYPE: 'address',
            INDEXED: true,
            INTERNALTYPE: 'address',
          },
        ],
        ANONYMOUS: false,
      },
      {
        NAME: 'Transfer',
        TYPE: 'event',
        INPUTS: [
          {
            NAME: 'from',
            TYPE: 'address',
            INDEXED: true,
            INTERNALTYPE: 'address',
          },
          {
            NAME: 'to',
            TYPE: 'address',
            INDEXED: true,
            INTERNALTYPE: 'address',
          },
          {
            NAME: 'value',
            TYPE: 'uint256',
            INDEXED: false,
            INTERNALTYPE: 'uint256',
          },
        ],
        ANONYMOUS: false,
      },
      {
        NAME: 'UpdatedDescription',
        TYPE: 'event',
        INPUTS: [
          {
            NAME: 'updatedBy',
            TYPE: 'address',
            INDEXED: false,
            INTERNALTYPE: 'address',
          },
          {
            NAME: 'description',
            TYPE: 'string',
            INDEXED: false,
            INTERNALTYPE: 'string',
          },
        ],
        ANONYMOUS: false,
      },
      {
        NAME: 'UpdatedTokenParams',
        TYPE: 'event',
        INPUTS: [
          {
            NAME: 'currency',
            TYPE: 'string',
            INDEXED: false,
            INTERNALTYPE: 'string',
          },
          {
            NAME: 'price',
            TYPE: 'uint256',
            INDEXED: false,
            INTERNALTYPE: 'uint256',
          },
        ],
        ANONYMOUS: false,
      },
      {
        NAME: 'addOwner',
        TYPE: 'function',
        INPUTS: [
          {
            NAME: '_address',
            TYPE: 'address',
            INTERNALTYPE: 'address',
          },
        ],
        OUTPUTS: [
          {
            NAME: 'success',
            TYPE: 'bool',
            INTERNALTYPE: 'bool',
          },
        ],
        STATEMUTABILITY: 'nonpayable',
      },
      {
        NAME: 'allowance',
        TYPE: 'function',
        INPUTS: [
          {
            NAME: 'owner',
            TYPE: 'address',
            INTERNALTYPE: 'address',
          },
          {
            NAME: 'spender',
            TYPE: 'address',
            INTERNALTYPE: 'address',
          },
        ],
        OUTPUTS: [
          {
            NAME: '',
            TYPE: 'uint256',
            INTERNALTYPE: 'uint256',
          },
        ],
        STATEMUTABILITY: 'view',
      },
      {
        NAME: 'approve',
        TYPE: 'function',
        INPUTS: [
          {
            NAME: 'spender',
            TYPE: 'address',
            INTERNALTYPE: 'address',
          },
          {
            NAME: 'value',
            TYPE: 'uint256',
            INTERNALTYPE: 'uint256',
          },
        ],
        OUTPUTS: [
          {
            NAME: '',
            TYPE: 'bool',
            INTERNALTYPE: 'bool',
          },
        ],
        STATEMUTABILITY: 'nonpayable',
      },
      {
        NAME: 'balanceOf',
        TYPE: 'function',
        INPUTS: [
          {
            NAME: 'account',
            TYPE: 'address',
            INTERNALTYPE: 'address',
          },
        ],
        OUTPUTS: [
          {
            NAME: '',
            TYPE: 'uint256',
            INTERNALTYPE: 'uint256',
          },
        ],
        STATEMUTABILITY: 'view',
      },
      {
        NAME: 'burn',
        TYPE: 'function',
        INPUTS: [
          {
            NAME: 'value',
            TYPE: 'uint256',
            INTERNALTYPE: 'uint256',
          },
        ],
        OUTPUTS: [],
        STATEMUTABILITY: 'nonpayable',
      },
      {
        NAME: 'burnFrom',
        TYPE: 'function',
        INPUTS: [
          {
            NAME: '_account',
            TYPE: 'address',
            INTERNALTYPE: 'address',
          },
          {
            NAME: '_value',
            TYPE: 'uint256',
            INTERNALTYPE: 'uint256',
          },
        ],
        OUTPUTS: [],
        STATEMUTABILITY: 'nonpayable',
      },
      {
        NAME: 'currency',
        TYPE: 'function',
        INPUTS: [],
        OUTPUTS: [
          {
            NAME: '',
            TYPE: 'string',
            INTERNALTYPE: 'string',
          },
        ],
        STATEMUTABILITY: 'view',
      },
      {
        NAME: 'decimals',
        TYPE: 'function',
        INPUTS: [],
        OUTPUTS: [
          {
            NAME: '',
            TYPE: 'uint8',
            INTERNALTYPE: 'uint8',
          },
        ],
        STATEMUTABILITY: 'view',
      },
      {
        NAME: 'description',
        TYPE: 'function',
        INPUTS: [],
        OUTPUTS: [
          {
            NAME: '',
            TYPE: 'string',
            INTERNALTYPE: 'string',
          },
        ],
        STATEMUTABILITY: 'view',
      },
      {
        NAME: 'isOwner',
        TYPE: 'function',
        INPUTS: [
          {
            NAME: '_address',
            TYPE: 'address',
            INTERNALTYPE: 'address',
          },
        ],
        OUTPUTS: [
          {
            NAME: '',
            TYPE: 'bool',
            INTERNALTYPE: 'bool',
          },
        ],
        STATEMUTABILITY: 'view',
      },
      {
        NAME: 'isTrustedForwarder',
        TYPE: 'function',
        INPUTS: [
          {
            NAME: 'forwarder',
            TYPE: 'address',
            INTERNALTYPE: 'address',
          },
        ],
        OUTPUTS: [
          {
            NAME: '',
            TYPE: 'bool',
            INTERNALTYPE: 'bool',
          },
        ],
        STATEMUTABILITY: 'view',
      },
      {
        NAME: 'listOwners',
        TYPE: 'function',
        INPUTS: [],
        OUTPUTS: [
          {
            NAME: '',
            TYPE: 'address[]',
            INTERNALTYPE: 'address[]',
          },
        ],
        STATEMUTABILITY: 'view',
      },
      {
        NAME: 'mint',
        TYPE: 'function',
        INPUTS: [
          {
            NAME: '_address',
            TYPE: 'address',
            INTERNALTYPE: 'address',
          },
          {
            NAME: '_amount',
            TYPE: 'uint256',
            INTERNALTYPE: 'uint256',
          },
        ],
        OUTPUTS: [
          {
            NAME: '',
            TYPE: 'uint256',
            INTERNALTYPE: 'uint256',
          },
        ],
        STATEMUTABILITY: 'nonpayable',
      },
      {
        NAME: 'multicall',
        TYPE: 'function',
        INPUTS: [
          {
            NAME: 'data',
            TYPE: 'bytes[]',
            INTERNALTYPE: 'bytes[]',
          },
        ],
        OUTPUTS: [
          {
            NAME: 'results',
            TYPE: 'bytes[]',
            INTERNALTYPE: 'bytes[]',
          },
        ],
        STATEMUTABILITY: 'nonpayable',
      },
      {
        NAME: 'name',
        TYPE: 'function',
        INPUTS: [],
        OUTPUTS: [
          {
            NAME: '',
            TYPE: 'string',
            INTERNALTYPE: 'string',
          },
        ],
        STATEMUTABILITY: 'view',
      },
      {
        NAME: 'ownerCount',
        TYPE: 'function',
        INPUTS: [],
        OUTPUTS: [
          {
            NAME: '',
            TYPE: 'uint256',
            INTERNALTYPE: 'uint256',
          },
        ],
        STATEMUTABILITY: 'view',
      },
      {
        NAME: 'price',
        TYPE: 'function',
        INPUTS: [],
        OUTPUTS: [
          {
            NAME: '',
            TYPE: 'uint256',
            INTERNALTYPE: 'uint256',
          },
        ],
        STATEMUTABILITY: 'view',
      },
      {
        NAME: 'removeOwner',
        TYPE: 'function',
        INPUTS: [
          {
            NAME: '_address',
            TYPE: 'address',
            INTERNALTYPE: 'address',
          },
        ],
        OUTPUTS: [
          {
            NAME: 'success',
            TYPE: 'bool',
            INTERNALTYPE: 'bool',
          },
        ],
        STATEMUTABILITY: 'nonpayable',
      },
      {
        NAME: 'symbol',
        TYPE: 'function',
        INPUTS: [],
        OUTPUTS: [
          {
            NAME: '',
            TYPE: 'string',
            INTERNALTYPE: 'string',
          },
        ],
        STATEMUTABILITY: 'view',
      },
      {
        NAME: 'totalSupply',
        TYPE: 'function',
        INPUTS: [],
        OUTPUTS: [
          {
            NAME: '',
            TYPE: 'uint256',
            INTERNALTYPE: 'uint256',
          },
        ],
        STATEMUTABILITY: 'view',
      },
      {
        NAME: 'transfer',
        TYPE: 'function',
        INPUTS: [
          {
            NAME: 'to',
            TYPE: 'address',
            INTERNALTYPE: 'address',
          },
          {
            NAME: 'value',
            TYPE: 'uint256',
            INTERNALTYPE: 'uint256',
          },
        ],
        OUTPUTS: [
          {
            NAME: '',
            TYPE: 'bool',
            INTERNALTYPE: 'bool',
          },
        ],
        STATEMUTABILITY: 'nonpayable',
      },
      {
        NAME: 'transferFrom',
        TYPE: 'function',
        INPUTS: [
          {
            NAME: 'from',
            TYPE: 'address',
            INTERNALTYPE: 'address',
          },
          {
            NAME: 'to',
            TYPE: 'address',
            INTERNALTYPE: 'address',
          },
          {
            NAME: 'value',
            TYPE: 'uint256',
            INTERNALTYPE: 'uint256',
          },
        ],
        OUTPUTS: [
          {
            NAME: '',
            TYPE: 'bool',
            INTERNALTYPE: 'bool',
          },
        ],
        STATEMUTABILITY: 'nonpayable',
      },
      {
        NAME: 'trustedForwarder',
        TYPE: 'function',
        INPUTS: [],
        OUTPUTS: [
          {
            NAME: '',
            TYPE: 'address',
            INTERNALTYPE: 'address',
          },
        ],
        STATEMUTABILITY: 'view',
      },
      {
        NAME: 'updateDescription',
        TYPE: 'function',
        INPUTS: [
          {
            NAME: '_description',
            TYPE: 'string',
            INTERNALTYPE: 'string',
          },
        ],
        OUTPUTS: [],
        STATEMUTABILITY: 'nonpayable',
      },
      {
        NAME: 'updateTokenParams',
        TYPE: 'function',
        INPUTS: [
          {
            NAME: '_currency',
            TYPE: 'string',
            INTERNALTYPE: 'string',
          },
          {
            NAME: '_price',
            TYPE: 'uint256',
            INTERNALTYPE: 'uint256',
          },
          {
            NAME: '_description',
            TYPE: 'string',
            INTERNALTYPE: 'string',
          },
        ],
        OUTPUTS: [],
        STATEMUTABILITY: 'nonpayable',
      },
    ],
    ADDRESS: '0x1d45784980b574Bd753c6EFA94a24636da93c775',
  },
};

export const ADMIN = {
  ADDRESS: '0x0660361D2350fBAA95C0B946A7D278b3E30caA32',
};

export const API_URL = {
  URL: 'https://base-sepolia.g.alchemy.com/v2/DWIg24dRnbm436fI1SP9fc4HVdr3xTZu',
};

export const BLOCKCHAIN = {
  RPCURL:
    'https://base-sepolia.g.alchemy.com/v2/bnfGi0PVbNMijQJFjFng2De86z-QvOMR',
  CHAINNAME: 'base-sepolia',
  NATIVECURRENCY: {
    NAME: 'ETH',
    SYMBOL: 'ETH',
  },
};

export const CASH_TOKEN_CONTRACT = '0xA646F8152eAe26834B6DF52ea36FD3A913b65b78';
export const CASHTRACKER_SUBGRAPH_URL = {
  URL: 'https://api.goldsky.com/api/public/project_cmgzlsran007l5np2dmqp89cv/subgraphs/cash-tracker-dev/v0.0.1/gn',
};

export const CHAIN_SETTINGS = {
  name: 'EVM',
  type: 'evm',
  rpcUrl:
    'https://base-sepolia.g.alchemy.com/v2/bnfGi0PVbNMijQJFjFng2De86z-QvOMR',
  chainId: '84532',
  currency: {
    name: 'eth',
    symbol: 'eth',
  },
  explorerUrl: 'https://sepolia.basescan.org',
};

export const DEPLOYER_PRIVATE_KEY =
  '0x760f17ed2a76449836ac1219fdf9b450566ac587186ee4fb13daac233b509347';

export const ENTITIES = [
  {
    alias: 'UNICEF Nepal CO',
    address: '0xC52e90DB78DeB581D6CB8b5aEBda0802bA8F37B5',
    privateKey:
      '5fbfba72d025d3ab62849a654b5d90f7839af854f7566fc0317251e6becc17ac',
    smartAccount: '0xE17Fa0F009d2A3EaC3C2994D7933eD759CbCe257',
  },
  {
    alias: 'Municipality',
    address: '0x7131EDcF4500521cB6B55C0658b2d83589946f44',
    privateKey:
      '51812b53380becea3bd28994d28151adb36b7ce04fb777826497d9fc5e88574b',
    smartAccount: '0xB4b85A39C44667eDEc9F0eB5c328954e328E980B',
    isFieldOffice: true,
  },
  {
    alias: 'Beneficiary',
    address: '0xCc85BeEE78Cc66C03Dc6aa70080d66c85DCB308D',
    privateKey:
      '7d3eec01a82e7880cb3506377a94f3fd9f232793a094a6a361a8788b6603c6d4',
    smartAccount: '0xe5159f997F32D04F9276567bb2ED4CC0CdC9D8E4',
  },
];

export const ENTRY_POINT = '0x1e2717BC0dcE0a6632fe1B057e948ec3EF50E38b';
export const INKIND_ENTITIES = [
  {
    alias: 'UNICEF Nepal CO',
    address: '0xff6df32840557d712189612b5C323109E7aD49eE',
    privateKey:
      '0x8553534479de4b1d1299e1e193ded0ddf8f47dc9e95d5eec22c13548bab5d0ce',
    smartAccount: '0xB59a99f5738462a1b5b2fF14fFC99E1D9E2eF495',
  },
  {
    alias: 'Municipality',
    address: '0xcBE30C1d1C9A7AC13624d46cB5232475eB35d58a',
    privateKey:
      '0x6afd84c014aec9792ea4f75dde2c673b4c7d68dee9e882b7cadf5dbf6582c11c',
    smartAccount: '0x74d88eC2CB24544EAb4B68089e4D23F1a95A7074',
  },
];

export const INKIND_TOKEN_CONTRACT =
  '0xA646F8152eAe26834B6DF52ea36FD3A913b65b78';

export const INKINDTRACKER_SUBGRAPH_URL = {
  URL: 'https://api.goldsky.com/api/public/project_cmgzlsran007l5np2dmqp89cv/subgraphs/rahat-aa-dev-tracker/1.0.0/gn',
};

export const RAHAT_ADMIN_PRIVATE_KEY =
  '0x760f17ed2a76449836ac1219fdf9b450566ac587186ee4fb13daac233b509347';

export const SAFE_API_KEY =
  'eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzYWZlLWF1dGgtc2VydmljZSIsInN1YiI6IjEwZDdhZDEyZTNmMzQ3YjZiNWFhZGU5NzhkNzI4YmZjXzlmMTY5OTU2ZGYzZjQxNWM5NDE1MWNlZmVkMTU5MzEwIiwia2V5IjoiMTBkN2FkMTJlM2YzNDdiNmI1YWFkZTk3OGQ3MjhiZmNfOWYxNjk5NTZkZjNmNDE1Yzk0MTUxY2VmZWQxNTkzMTAiLCJhdWQiOlsic2FmZS1hdXRoLXNlcnZpY2UiXSwiZXhwIjoxOTI2MDQ4ODAwLCJyb2xlcyI6W10sImRhdGEiOnt9fQ.7smvjVjkT50TUSRtiYCgudEWcz1MJrSGbr0YNOTOe7Rc70EXBNUECjkFT4OS2b2lP2myXJ2ZDnUcp_yyQIrelA';

export const SAFE_PROPOSER_PRIVATE_ADDRESS =
  '0x8a104251f94eba07cb8c2a4407ca3e975c037a35a6fddc81ac4bcfd49ce6bb32';

export const SAFE_WALLET = {
  ADDRESS: '0x8241F385c739F7091632EEE5e72Dbb62f2717E76',
};

export const SUBGRAPH_URL = {
  URL: 'https://api.studio.thegraph.com/query/1721583/aa-unicef-evm-dev/version/latest',
};
