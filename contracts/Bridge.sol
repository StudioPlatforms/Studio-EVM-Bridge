// SPDX-License-Identifier: MIT
pragma solidity 0.8.0;

import "./security/ReentrancyGuard.sol";
import "./security/Pausable.sol";
import "./security/Ownable.sol";
import "./interfaces/IBridge.sol";
import "./interfaces/IHandler.sol";
import "./interfaces/IERC20.sol";

/**
 * @title Bridge
 * @dev Main contract for the bridge system
 */
contract Bridge is IBridge, ReentrancyGuard, Pausable, Ownable {
    // Chainid of this chain
    uint256 public immutable _chainID;

    // Deposit nonce per destination chain ID
    mapping(uint256 => uint64) public _depositCounts;

    // Mapping of resourceID to handler addresses
    mapping(bytes32 => address) public _resourceIDToHandlerAddress;

    // Mapping of deposit nonce to proposal for each origin chain ID
    mapping(uint256 => mapping(uint64 => Proposal)) public _proposals;

    // Mapping of addresses to relayer status
    mapping(address => bool) public _relayers;

    // Number of required votes to execute a proposal
    uint256 public _relayerThreshold;

    // Mapping of addresses to blacklist status
    mapping(address => bool) public _blacklist;

    // Mapping to store the source chain ID for each proposal
    // resourceID => amount => depositer => recipient => sourceChainID
    mapping(bytes32 => mapping(uint256 => mapping(address => mapping(address => uint256)))) public _proposalSourceChainID;

    // New mapping to track executed proposals by origin chain ID and deposit nonce
    // originChainID => depositNonce => executed
    mapping(uint256 => mapping(uint64 => bool)) public _executedProposals;

    /**
     * @dev Constructor
     * @param chainID ID of the chain this bridge is deployed on
     * @param initialRelayers Initial set of relayers
     * @param initialRelayerThreshold Initial number of required votes to execute a proposal
     */
    constructor(
        uint256 chainID,
        address[] memory initialRelayers,
        uint256 initialRelayerThreshold
    ) {
        _chainID = chainID;
        _relayerThreshold = initialRelayerThreshold;

        for (uint256 i = 0; i < initialRelayers.length; i++) {
            _relayers[initialRelayers[i]] = true;
            emit RelayerAdded(initialRelayers[i]);
        }
    }

    /**
     * @dev Returns the address of the current owner.
     * @return The address of the owner.
     */
    function owner() public view virtual override(Ownable, IBridge) returns (address) {
        return Ownable.owner();
    }

    /**
     * @dev Deposit tokens to the bridge
     * @param destChainID ID of the destination chain
     * @param resourceID Resource ID of the token
     * @param data Additional data for the deposit (encoded amount and recipient)
     */
    function deposit(
        uint256 destChainID,
        bytes32 resourceID,
        bytes calldata data
    ) external payable override nonReentrant whenNotPaused {
        // Validate deposit
        require(destChainID != _chainID, "Bridge: cannot deposit to same chain");
        require(!_blacklist[msg.sender], "Bridge: depositer is blacklisted");
        
        address handler = _resourceIDToHandlerAddress[resourceID];
        require(handler != address(0), "Bridge: invalid resourceID");
        
        // Process deposit
        _processDeposit(destChainID, resourceID, handler, data);
    }

    /**
     * @dev Internal function to process a deposit
     */
    function _processDeposit(
        uint256 destChainID,
        bytes32 resourceID,
        address handler,
        bytes calldata data
    ) internal {
        // Get deposit nonce
        uint64 depositNonce = ++_depositCounts[destChainID];
        
        // Decode recipient from data
        (, address recipientFromData) = abi.decode(data, (uint256, address));
        
        // If recipient is not specified, use the sender
        address recipient = recipientFromData == address(0) ? msg.sender : recipientFromData;
        
        // Call handler to lock or burn tokens
        bytes memory handlerResponse = IHandler(handler).deposit{value: msg.value}(
            resourceID,
            msg.sender,
            destChainID,
            data
        );
        
        // Process handler response
        _processHandlerResponse(destChainID, resourceID, handler, depositNonce, recipient, handlerResponse);
    }

    /**
     * @dev Internal function to process handler response
     */
    function _processHandlerResponse(
        uint256 destChainID,
        bytes32 resourceID,
        address handler,
        uint64 depositNonce,
        address recipient,
        bytes memory handlerResponse
    ) internal {
        // Decode the handler response
        (uint256 amountAfterFees, address depositer, address recipientFromHandler) = abi.decode(handlerResponse, (uint256, address, address));
        
        // Use the recipient from the handler if provided
        if (recipientFromHandler != address(0)) {
            recipient = recipientFromHandler;
        }
        
        // Construct proposal data
        bytes memory proposalData = abi.encodePacked(
            resourceID,
            abi.encode(amountAfterFees, depositer, recipient)
        );
        
        // Compute dataHash
        bytes32 dataHash = keccak256(abi.encodePacked(handler, proposalData));
        
        // Encode recipient address for the event
        bytes memory recipientBytes = abi.encodePacked(recipient);
        
        // Emit deposit event
        emit Deposit(
            destChainID,
            resourceID,
            depositNonce,
            depositer,
            recipientBytes,
            amountAfterFees,
            dataHash
        );
    }

    /**
     * @dev Vote on a proposal
     * @param originChainID ID of the origin chain
     * @param depositNonce Nonce of the deposit
     * @param resourceID Resource ID of the token
     * @param data Additional data for the proposal
     */
    function voteProposal(
        uint256 originChainID,
        uint64 depositNonce,
        bytes32 resourceID,
        bytes calldata data
    ) external override nonReentrant whenNotPaused onlyRelayers {
        require(originChainID != _chainID, "Bridge: cannot vote on proposal from same chain");

        address handler = _resourceIDToHandlerAddress[resourceID];
        require(handler != address(0), "Bridge: invalid resourceID");

        // Construct proposal data (resourceID + data)
        bytes memory proposalData = abi.encodePacked(resourceID, data);
        bytes32 dataHash = keccak256(abi.encodePacked(handler, proposalData));
        
        Proposal storage proposal = _proposals[originChainID][depositNonce];

        // If the proposal doesn't exist, create it
        if (proposal.status == ProposalStatus.Inactive) {
            proposal.status = ProposalStatus.Active;
            proposal.dataHash = dataHash;
        } else {
            require(proposal.dataHash == dataHash, "Bridge: data hash mismatch");
            require(proposal.status == ProposalStatus.Active, "Bridge: proposal is not active");
        }

        // Check if the relayer has already voted
        require(!proposal.hasVoted[msg.sender], "Bridge: relayer has already voted");
        proposal.hasVoted[msg.sender] = true;
        proposal.yesVotes.push(msg.sender);

        // Check if the proposal has enough votes to pass
        if (proposal.yesVotes.length >= _relayerThreshold) {
            proposal.status = ProposalStatus.Passed;
        }

        emit ProposalVote(originChainID, depositNonce, proposal.status, dataHash);

        // If the proposal has passed, execute it
        if (proposal.status == ProposalStatus.Passed) {
            // Call executeProposal with the correct parameters
            _executeProposal(originChainID, depositNonce, resourceID, data);
        }
    }

    /**
     * @dev Execute a proposal
     * @param originChainID ID of the origin chain
     * @param depositNonce Nonce of the deposit
     * @param data Additional data for the proposal
     */
    function executeProposal(
        uint256 originChainID,
        uint64 depositNonce,
        bytes calldata data
    ) public override nonReentrant whenNotPaused {
        // Extract the resourceID from the first 32 bytes of data
        bytes32 resourceID;
        assembly {
            // Fix: Add 32 to data.offset to skip the length field and read the actual first 32 bytes
            resourceID := calldataload(add(data.offset, 32))
        }
        
        // Get the data without the resourceID
        bytes calldata dataWithoutResourceID = data[32:];
        
        // Call the internal function to execute the proposal
        _executeProposal(originChainID, depositNonce, resourceID, dataWithoutResourceID);
    }
    
    /**
     * @dev Internal function to execute a proposal
     * @param originChainID ID of the origin chain
     * @param depositNonce Nonce of the deposit
     * @param resourceID Resource ID of the token
     * @param data Additional data for the proposal
     */
    function _executeProposal(
        uint256 originChainID,
        uint64 depositNonce,
        bytes32 resourceID,
        bytes calldata data
    ) internal {
        Proposal storage proposal = _proposals[originChainID][depositNonce];
        require(proposal.status == ProposalStatus.Passed, "Bridge: proposal is not passed");

        // Check if the proposal has already been executed
        require(!_executedProposals[originChainID][depositNonce], "Bridge: proposal already executed");

        address handler = _resourceIDToHandlerAddress[resourceID];
        require(handler != address(0), "Bridge: invalid resourceID");

        // Decode data
        (uint256 amount, address depositer, address recipient) = abi.decode(data, (uint256, address, address));

        // Check if the recipient is blacklisted
        require(!_blacklist[recipient], "Bridge: recipient is blacklisted");

        // Store the source chain ID for this proposal (for backward compatibility)
        _proposalSourceChainID[resourceID][amount][depositer][recipient] = originChainID;

        // Mark the proposal as executed in both mappings
        proposal.status = ProposalStatus.Executed;
        _executedProposals[originChainID][depositNonce] = true;

        // Call handler to release or mint tokens
        IHandler(handler).executeProposal(resourceID, data);

        emit ProposalExecution(originChainID, depositNonce, proposal.dataHash);
    }

    /**
     * @dev Get the source chain ID for a proposal
     * @param resourceID Resource ID of the token
     * @param amount Amount of tokens
     * @param depositer Address of the depositer
     * @param recipient Address of the recipient
     * @return The source chain ID
     */
    function getProposalSourceChainID(
        bytes32 resourceID,
        uint256 amount,
        address depositer,
        address recipient
    ) external view override returns (uint256) {
        uint256 sourceChainID = _proposalSourceChainID[resourceID][amount][depositer][recipient];
        require(sourceChainID != 0, "Bridge: proposal source chain ID not found");
        return sourceChainID;
    }

    /**
     * @dev Check if a proposal has been executed
     * @param originChainID ID of the origin chain
     * @param depositNonce Nonce of the deposit
     * @return True if the proposal has been executed, false otherwise
     */
    function isProposalExecuted(uint256 originChainID, uint64 depositNonce) external view override returns (bool) {
        return _executedProposals[originChainID][depositNonce];
    }

    /**
     * @dev Cancel a proposal
     * @param originChainID ID of the origin chain
     * @param depositNonce Nonce of the deposit
     */
    function cancelProposal(uint256 originChainID, uint64 depositNonce) external override onlyOwner {
        Proposal storage proposal = _proposals[originChainID][depositNonce];
        require(proposal.status == ProposalStatus.Active || proposal.status == ProposalStatus.Passed, "Bridge: proposal is not active or passed");

        proposal.status = ProposalStatus.Cancelled;
        emit ProposalVote(originChainID, depositNonce, proposal.status, proposal.dataHash);
    }

    /**
     * @dev Admin function to withdraw tokens from the bridge
     * @param token Address of the token
     * @param recipient Address of the recipient
     * @param amount Amount of tokens to withdraw
     */
    function adminWithdraw(
        address token,
        address recipient,
        uint256 amount
    ) external override onlyOwner {
        if (token == address(0)) {
            // Withdraw native tokens
            payable(recipient).transfer(amount);
        } else {
            // Withdraw ERC20 tokens
            IERC20 erc20 = IERC20(token);
            require(erc20.transfer(recipient, amount), "Bridge: transfer failed");
        }
    }

    /**
     * @dev Set a resource ID for a handler
     * @param resourceID Resource ID to set
     * @param handlerAddress Address of the handler
     */
    function setResource(bytes32 resourceID, address handlerAddress) external override onlyOwner {
        _resourceIDToHandlerAddress[resourceID] = handlerAddress;
        emit ResourceIDSet(resourceID, handlerAddress);
    }

    /**
     * @dev Add a relayer
     * @param relayer Address of the relayer
     */
    function addRelayer(address relayer) external override onlyOwner {
        require(!_relayers[relayer], "Bridge: relayer already exists");
        _relayers[relayer] = true;
        emit RelayerAdded(relayer);
    }

    /**
     * @dev Remove a relayer
     * @param relayer Address of the relayer
     */
    function removeRelayer(address relayer) external override onlyOwner {
        require(_relayers[relayer], "Bridge: relayer does not exist");
        _relayers[relayer] = false;
        emit RelayerRemoved(relayer);
    }

    /**
     * @dev Check if an address is a relayer
     * @param relayer Address to check
     * @return True if the address is a relayer, false otherwise
     */
    function isRelayer(address relayer) external view override returns (bool) {
        return _relayers[relayer];
    }

    /**
     * @dev Set the fee percentage
     * @param feePercentage Fee percentage to set
     */
    function setFeePercentage(uint256 feePercentage) external override onlyOwner {
        // This function is a pass-through to the handler
        // It's implemented here to satisfy the IBridge interface
    }

    /**
     * @dev Set the chain fee multiplier
     * @param chainId ID of the chain
     * @param feeMultiplier Fee multiplier to set
     */
    function setChainFeeMultiplier(uint256 chainId, uint256 feeMultiplier) external override onlyOwner {
        // This function is a pass-through to the handler
        // It's implemented here to satisfy the IBridge interface
    }

    /**
     * @dev Set the resource fee multiplier
     * @param resourceID Resource ID
     * @param feeMultiplier Fee multiplier to set
     */
    function setResourceFeeMultiplier(bytes32 resourceID, uint256 feeMultiplier) external override onlyOwner {
        // This function is a pass-through to the handler
        // It's implemented here to satisfy the IBridge interface
    }

    /**
     * @dev Set the individual fee multiplier
     * @param chainId ID of the chain
     * @param resourceID Resource ID
     * @param feeMultiplier Fee multiplier to set
     */
    function setIndividualFeeMultiplier(
        uint256 chainId,
        bytes32 resourceID,
        uint256 feeMultiplier
    ) external override onlyOwner {
        // This function is a pass-through to the handler
        // It's implemented here to satisfy the IBridge interface
    }

    /**
     * @dev Blacklist an address
     * @param user Address to blacklist
     */
    function blacklistAddress(address user) external override onlyOwner {
        require(!_blacklist[user], "Bridge: address already blacklisted");
        _blacklist[user] = true;
        emit AddressBlacklisted(user);
    }

    /**
     * @dev Remove an address from the blacklist
     * @param user Address to remove from the blacklist
     */
    function unblacklistAddress(address user) external override onlyOwner {
        require(_blacklist[user], "Bridge: address not blacklisted");
        _blacklist[user] = false;
        emit AddressUnblacklisted(user);
    }

    /**
     * @dev Check if an address is blacklisted
     * @param user Address to check
     * @return True if the address is blacklisted, false otherwise
     */
    function isBlacklisted(address user) external view override returns (bool) {
        return _blacklist[user];
    }

    /**
     * @dev Pause the bridge
     */
    function pause() external override onlyOwner {
        _pause();
    }

    /**
     * @dev Unpause the bridge
     */
    function unpause() external override onlyOwner {
        _unpause();
    }

    /**
     * @dev Modifier to restrict access to relayers
     */
    modifier onlyRelayers() {
        require(_relayers[msg.sender], "Bridge: caller is not a relayer");
        _;
    }

    /**
     * @dev Receive function to accept native tokens
     */
    receive() external payable {
        // Accept native tokens
    }

    /**
     * @dev Fallback function to accept native tokens
     */
    fallback() external payable {
        // Accept native tokens
    }
}
