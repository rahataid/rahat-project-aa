//SPDX-License-Identifier: LGPL-3.0
pragma solidity 0.8.23;

import '../libraries/AbstractProject.sol';
import '../interfaces/IAAProject.sol';
import '@openzeppelin/contracts/metatx/ERC2771Context.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/metatx/ERC2771Forwarder.sol';
import '@openzeppelin/contracts/utils/Multicall.sol';
import '../interfaces/ITriggerManager.sol';
import '@openzeppelin/contracts/access/manager/AccessManaged.sol';
import '@openzeppelin/contracts/access/manager/AccessManaged.sol';

/// @title AAProject - Implementation of IAAProject interface
/// @notice This contract implements the IAAProject interface and provides functionalities for managing beneficiaries, claims, and referrals.
/// @dev This contract uses the ERC2771Context for meta-transactions and extends AbstractProject for basic project functionality.
contract AAProject is
  AbstractProject,
  IAAProject,
  ERC2771Context,
  AccessManaged
  ERC2771Context,
  AccessManaged
{
  using EnumerableSet for EnumerableSet.AddressSet;

  event ClaimAssigned(
    address indexed beneficiary,
    address indexed token,
    address indexed assigner
  );

  event BenTokensAssigned(address indexed beneficiary, uint indexed amount);
  event TokenTransferred(address indexed beneficiary, address indexed vendor,uint indexed amount);

  /// @dev Interface ID for IAAProject
  bytes4 public constant IID_RAHAT_PROJECT = type(IAAProject).interfaceId;

  /// @dev access manager
  ITriggerManager public TriggerManager;

  /// @dev address of default token
  address public defaultToken;

  /// @dev set of claim assigners
  EnumerableSet.AddressSet private claimAssigners;

  /// @notice tracks the registered token address
  /// @dev key-value pair of token address and registered status
  mapping(address => bool) public registeredTokens;

  /// @notice tracks the number of tokens assigned to a beneficiary
  /// @dev key-value pair of token address and registered status
  mapping(address => uint) public benTokens;
  mapping(address => uint) public benCashTokens;

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
    address _accessManager,
    address _accessManager,
    address _triggerManager
  )
    AbstractProject(_name)
    ERC2771Context(_forwarder)
    AccessManaged(_accessManager)
    AccessManaged(_accessManager)
  {
    defaultToken = _defaultToken;
    TriggerManager = ITriggerManager(_triggerManager);
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
  function increaseTokenBudget(address _tokenAddress, uint256 _amount) public {
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
  ) public restricted {
    require(
      IERC20(defaultToken).balanceOf(address(this)) >=
        totalClaimsAssigned() + _amount,
      'not enough tokens'
    );
    _addBeneficiary(_address);
    benTokens[_address] = benTokens[_address] + _amount;
    emit BenTokensAssigned(_address, _amount);
  }

  ///@notice function to add beneficiaries
  ///@dev can only be called by project admin when project is open
  function totalClaimsAssigned() public view returns (uint _totalClaims) {
    for (uint i = 0; i < _beneficiaries.length(); i++) {
      _totalClaims += benTokens[_beneficiaries.at(i)];
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
    IERC20(_tokenAddress).transfer(_beneficiary, _tokenAssigned);
    benTokens[_beneficiary] = benTokens[_beneficiary] - _tokenAssigned;
    emit ClaimAssigned(_beneficiary, _tokenAddress, _assigner);
  }

  function assignClaims(address _beneficiary, uint256 _tokenAssigned) public {
    // require(TriggerManager.hasTriggered(), 'distribution not triggered');
    _assignClaims(_beneficiary, defaultToken, _tokenAssigned, _msgSender());
  }

function transferTokenToVendor(
    address _benAddress,
    address _vendorAddress,
    uint _amount
  ) public {
    require(
      benTokens[_benAddress] >= _amount,
      'not enough balace'
    );
    benTokens[_benAddress] -= _amount;
    require(
      IERC20(defaultToken).transfer(_vendorAddress, _amount),
      'transfer failed'
    );
    emit TokenTransferred(_benAddress, _vendorAddress, _amount);
  }

  function transferTokenToVendorWithCashToken(
    address _benAddress,
    address _vendorAddress,
    address _cashTokenAddress,
    uint _amount
  ) public {
    require(
      benTokens[_benAddress] >= _amount,
      'not enough balace'
    );
    benTokens[_benAddress] -= _amount;
    require(
      IERC20(defaultToken).transfer(_vendorAddress, _amount),
      'transfer failed'
      IERC20(_cashTokenAddress).transferFrom(_vendorAddress, _benAddress, _amount),
    );
    benCashTokens[_benAddress] += _amount;
    emit TokenTransferred(_benAddress, _vendorAddress, _amount);
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
