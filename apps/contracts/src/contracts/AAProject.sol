//SPDX-License-Identifier: LGPL-3.0
pragma solidity 0.8.23;

import '../libraries/AbstractProject.sol';
import '../interfaces/IAAProject.sol';
import '@openzeppelin/contracts/metatx/ERC2771Context.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/metatx/ERC2771Forwarder.sol';
import '@openzeppelin/contracts/utils/Multicall.sol';
import '@openzeppelin/contracts/access/manager/AccessManaged.sol';
import '@openzeppelin/contracts/access/manager/AccessManaged.sol';

import '@openzeppelin/contracts/utils/ReentrancyGuard.sol';

/// @title AAProject - Implementation of IAAProject interface
/// @notice This contract implements the IAAProject interface and provides functionalities for managing beneficiaries, claims, and referrals.
/// @dev This contract uses the ERC2771Context for meta-transactions and extends AbstractProject for basic project functionality.
contract AAProject is
  AbstractProject,
  IAAProject,
  ERC2771Context,
  AccessManaged,
  ReentrancyGuard
  {
  using EnumerableSet for EnumerableSet.AddressSet;

  event ClaimAssigned(
    address indexed beneficiary,
    address indexed token,
    address indexed assigner
  );

  event BenTokensAssigned(address indexed beneficiary, uint indexed amount);
  event TokenTransferred(address indexed beneficiary, address indexed vendor,uint indexed amount);
  event CashTokenTransferred(address indexed vendor, address indexed beneficiary,uint indexed amount);

  /// @dev Interface ID for IAAProject
  bytes4 public constant IID_RAHAT_PROJECT = type(IAAProject).interfaceId;

  /// @dev address of default token
  address public immutable defaultToken;

  /// @notice tracks the registered token address
  /// @dev key-value pair of token address and registered status
  mapping(address => bool) public registeredTokens;

  /// @notice tracks the number of tokens assigned to a beneficiary
  /// @dev key-value pair of token address and registered status
  mapping(address => uint) public benTokens;
  mapping(address => uint) public benCashTokens;

  uint256 totalClaimAssigned;

  ///@notice constructor
  ///@param _name name of the project
  ///@param _defaultToken address of the default token(ERC20)
  ///@param _forwarder address of the forwarder contract
  ///@param _accessManager Access Manager contract address
  ///@param _accessManager Access Manager contract address
  constructor(
    string memory _name,
    address _defaultToken,
    address _forwarder,
    address _accessManager
  )
    AbstractProject(_name)
    ERC2771Context(_forwarder)
    AccessManaged(_accessManager)
  {
    defaultToken = _defaultToken;
  }

  // #endregion
  function supportsInterface(
    bytes4 interfaceId
  ) public view virtual override returns (bool) {
    return interfaceId == IID_RAHAT_PROJECT;
  }

  ///@notice function to increase the tokenBudget
  ///@param _amount amount to increase the budget
  ///@param _tokenAddress address of the token to increase budget
  ///@dev can only be called by admin.Mainly called during minting of tokens
  function increaseTokenBudget(address _tokenAddress, uint256 _amount) public restricted {
    uint256 budget = tokenBudget(_tokenAddress);
    //TODO might not be needed
    require(
      IERC20(_tokenAddress).totalSupply() >= budget + _amount,
      'Greater than total supply'
    );
    _tokenBudgetIncrease(_tokenAddress, _amount);
  }

  // region *****Beneficiary Functions *****//
  ///@notice function to assign tokens to beneficiaries
  ///@param _address address of the beneficiary
  ///@dev can only be called by project admin when project is open
  function assignTokenToBeneficiary(
    address _address,
    uint _amount
  ) public restricted nonReentrant {
    require(
      IERC20(defaultToken).balanceOf(address(this)) >=
        totalClaimAssigned + _amount,
      'not enough tokens'
    );
    _addBeneficiary(_address);
    benTokens[_address] = benTokens[_address] + _amount;
    totalClaimAssigned += _amount;
    emit BenTokensAssigned(_address, _amount);
  }

  ///@notice function to add beneficiaries
  ///@param offset starting index for beneficiaries list 
  ///@param limit total number of beneficiaries 
  ///@dev can only be called by project admin when project is open
  function totalClaimsAssigned(
    uint256 offset,
    uint256 limit
) public view returns (uint256 totalClaims) {
    uint256 length = _beneficiaries.length();

    if (offset >= length) {
        return 0;
    }

    uint256 end = offset + limit;
    if (end > length) {
        end = length;
    }

    for (uint256 i = offset; i < end; i++) {
        address beneficiary = _beneficiaries.at(i);
        totalClaims += benTokens[beneficiary];
    }
}


  ///@notice function to remove beneficiaries
  ///@param _address address of the beneficiary to be removed
  ///@dev can only be called by project admin when project is open
  function addBeneficiary(address _address) public {
    _addBeneficiary(_address);
  }

  ///@notice function to remove beneficiaries
  ///@param _address address of the beneficiary to be removed
  ///@dev can only be called by project admin when project is open
  function removeBeneficiary(address _address) public {
    _removeBeneficiary(_address);
  }

  ///@notice internal function to assign  token/claims to beneficiaries
  ///@param _beneficiary address of beneficiaires to assign claims
  ///@param _tokenAddress address of the token to assign
  ///@param _tokenAssigned amount of token assigned till date
  ///@dev internal function to assign claims
  // TODO Replace ClaimAssigned by using etherisc Insurance Framework
  function _assignClaims(
    address _beneficiary,
    address _tokenAddress,
    uint256 _tokenAssigned,
    address _assigner
  ) private {
    require(benTokens[_beneficiary] >= _tokenAssigned, 'not enough balance');
    benTokens[_beneficiary] = benTokens[_beneficiary] - _tokenAssigned;
    totalClaimAssigned -= _tokenAssigned;
    require(IERC20(_tokenAddress).transfer(_beneficiary, _tokenAssigned),
      'transfer failed'
    );
    emit ClaimAssigned(_beneficiary, _tokenAddress, _assigner);
  }

  function assignClaims(address _beneficiary, uint256 _tokenAssigned) public nonReentrant {
    // require(TriggerManager.hasTriggered(), 'distribution not triggered');
    _assignClaims(_beneficiary, defaultToken, _tokenAssigned, _msgSender());
  }

function transferTokenToVendor(
    address _benAddress,
    address _vendorAddress,
    uint _amount
  ) public restricted  nonReentrant{
    require(
      benTokens[_benAddress] >= _amount,
      'not enough balace'
    );
    benTokens[_benAddress] -= _amount;
    totalClaimAssigned -= _amount;
    require(
      IERC20(defaultToken).transfer(_vendorAddress, _amount),
      'transfer failed'
    );
    emit TokenTransferred(_benAddress, _vendorAddress, _amount);
  }

  function transferTokenToVendorForCashToken(
    address _benAddress,
    address _vendorAddress,
    address _cashTokenAddress,
    uint _amount
  ) public  restricted nonReentrant {
    require(
      benTokens[_benAddress] >= _amount,
      'not enough balace'
    );
    benTokens[_benAddress] -= _amount;
    totalClaimAssigned -= _amount;
    require( IERC20(defaultToken).transfer(_vendorAddress, _amount),'value token transfer failed' );
    require( IERC20(_cashTokenAddress).transferFrom(_vendorAddress, _benAddress, _amount),'cash token transfer failed' );

    benCashTokens[_benAddress] += _amount;
    emit TokenTransferred(_benAddress, _vendorAddress, _amount);
    emit CashTokenTransferred(_vendorAddress, _benAddress, _amount);
  } 
  
  // #endregion


  // endregion
  /// @dev overriding the method to ERC2771Context
  function _msgSender()
    internal
    view
    override(Context, ERC2771Context)
    returns (address sender)
  {
    sender = ERC2771Context._msgSender();
  }

  /// @dev overriding the method to ERC2771Context
  function _msgData()
    internal
    view
    override(Context, ERC2771Context)
    returns (bytes calldata)
  {
    return ERC2771Context._msgData();
  }

  function _contextSuffixLength()
    internal
    view
    override(Context, ERC2771Context)
    returns (uint256)
  {
    return ERC2771Context._contextSuffixLength();
  }

  //     modifier  {
  //     require(checkVendorStatus(_msgSender()), 'Only vendor can execute this transaction');
  //     _;
  //   }
}
