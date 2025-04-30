// SPDX-License-Identifier: MIT
pragma solidity 0.8.0;

/**
 * @title IBridge
 * @dev Interface for the Bridge contract
 */
interface IBridge {
    /**
     * @dev Emitted when a deposit is made
     * @param destinationChainId The ID of the destination chain
     * @param resourceID The resource ID of the token
     * @param depositNonce The nonce of the deposit
     * @param depositer The address of the depositer
     * @param recipient The address of the recipient on the destination chain
     * @param amount The amount of tokens deposited
     * @param dataHash The hash of additional data
     */
    event Deposit(
        uint256 indexed destinationChainId,
        bytes32 indexed resourceID,
        uint64 indexed depositNonce,
        address depositer,
        bytes recipient,
        uint256 amount,
        bytes32 dataHash
    );

    /**
     * @dev Emitted when a proposal is executed
     * @param originChainId The ID of the origin chain
     * @param depositNonce The nonce of the deposit
     * @param dataHash The hash of the data
     */
    event ProposalExecution(
        uint256 indexed originChainId,
        uint64 indexed depositNonce,
        bytes32 indexed dataHash
    );

    /**
     * @dev Emitted when a proposal is voted on
     * @param originChainId The ID of the origin chain
     * @param depositNonce The nonce of the deposit
     * @param status The status of the proposal
     * @param dataHash The hash of the data
     */
    event ProposalVote(
        uint256 indexed originChainId,
        uint64 indexed depositNonce,
        ProposalStatus indexed status,
        bytes32 dataHash
    );

    /**
     * @dev Emitted when a relayer is added
     * @param relayer The address of the relayer
     */
    event RelayerAdded(address indexed relayer);

    /**
     * @dev Emitted when a relayer is removed
     * @param relayer The address of the relayer
     */
    event RelayerRemoved(address indexed relayer);

    /**
     * @dev Emitted when a resource ID is set
     * @param resourceID The resource ID
     * @param handlerAddress The address of the handler
     */
    event ResourceIDSet(bytes32 indexed resourceID, address handlerAddress);

    /**
     * @dev Emitted when a fee is collected
     * @param sender The address of the sender
     * @param token The address of the token
     * @param amount The amount of tokens collected
     */
    event FeeCollected(address indexed sender, address indexed token, uint256 amount);

    /**
     * @dev Emitted when an address is blacklisted
     * @param user The address that was blacklisted
     */
    event AddressBlacklisted(address indexed user);

    /**
     * @dev Emitted when an address is removed from the blacklist
     * @param user The address that was removed from the blacklist
     */
    event AddressUnblacklisted(address indexed user);

    /**
     * @dev Enum for proposal status
     */
    enum ProposalStatus {
        Inactive,
        Active,
        Passed,
        Executed,
        Cancelled
    }

    /**
     * @dev Struct for a deposit proposal
     */
    struct Proposal {
        ProposalStatus status;
        bytes32 dataHash;
        address[] yesVotes;
        mapping(address => bool) hasVoted;
    }

    /**
     * @dev Deposit tokens to the bridge
     * @param destinationChainId The ID of the destination chain
     * @param resourceID The resource ID of the token
     * @param data The data containing recipient and amount
     */
    function deposit(
        uint256 destinationChainId,
        bytes32 resourceID,
        bytes calldata data
    ) external payable;

    /**
     * @dev Vote on a proposal
     * @param originChainId The ID of the origin chain
     * @param depositNonce The nonce of the deposit
     * @param resourceID The resource ID of the token
     * @param data The data containing recipient and amount
     */
    function voteProposal(
        uint256 originChainId,
        uint64 depositNonce,
        bytes32 resourceID,
        bytes calldata data
    ) external;

    /**
     * @dev Execute a proposal
     * @param originChainId The ID of the origin chain
     * @param depositNonce The nonce of the deposit
     * @param data The data containing recipient and amount
     */
    function executeProposal(
        uint256 originChainId,
        uint64 depositNonce,
        bytes calldata data
    ) external;

    /**
     * @dev Cancel a proposal
     * @param originChainId The ID of the origin chain
     * @param depositNonce The nonce of the deposit
     */
    function cancelProposal(uint256 originChainId, uint64 depositNonce) external;

    /**
     * @dev Admin function to withdraw tokens from the bridge
     * @param token The address of the token
     * @param recipient The address of the recipient
     * @param amount The amount of tokens to withdraw
     */
    function adminWithdraw(
        address token,
        address recipient,
        uint256 amount
    ) external;

    /**
     * @dev Set a resource ID for a handler
     * @param resourceID The resource ID
     * @param handlerAddress The address of the handler
     */
    function setResource(bytes32 resourceID, address handlerAddress) external;

    /**
     * @dev Add a relayer
     * @param relayer The address of the relayer
     */
    function addRelayer(address relayer) external;

    /**
     * @dev Remove a relayer
     * @param relayer The address of the relayer
     */
    function removeRelayer(address relayer) external;

    /**
     * @dev Check if an address is a relayer
     * @param relayer The address to check
     * @return True if the address is a relayer, false otherwise
     */
    function isRelayer(address relayer) external view returns (bool);

    /**
     * @dev Set the fee percentage
     * @param feePercentage The fee percentage
     */
    function setFeePercentage(uint256 feePercentage) external;

    /**
     * @dev Set the chain fee multiplier
     * @param chainId The ID of the chain
     * @param feeMultiplier The fee multiplier
     */
    function setChainFeeMultiplier(uint256 chainId, uint256 feeMultiplier) external;

    /**
     * @dev Set the resource fee multiplier
     * @param resourceID The resource ID
     * @param feeMultiplier The fee multiplier
     */
    function setResourceFeeMultiplier(bytes32 resourceID, uint256 feeMultiplier) external;

    /**
     * @dev Set the individual fee multiplier
     * @param chainId The ID of the chain
     * @param resourceID The resource ID
     * @param feeMultiplier The fee multiplier
     */
    function setIndividualFeeMultiplier(
        uint256 chainId,
        bytes32 resourceID,
        uint256 feeMultiplier
    ) external;

    /**
     * @dev Blacklist an address
     * @param user The address to blacklist
     */
    function blacklistAddress(address user) external;

    /**
     * @dev Remove an address from the blacklist
     * @param user The address to remove from the blacklist
     */
    function unblacklistAddress(address user) external;

    /**
     * @dev Check if an address is blacklisted
     * @param user The address to check
     * @return True if the address is blacklisted, false otherwise
     */
    function isBlacklisted(address user) external view returns (bool);

    /**
     * @dev Pause the bridge
     */
    function pause() external;

    /**
     * @dev Unpause the bridge
     */
    function unpause() external;

    /**
     * @dev Get the source chain ID for a proposal
     * @param resourceID The resource ID of the token
     * @param amount The amount of tokens
     * @param depositer The address of the depositer
     * @param recipient The address of the recipient
     * @return The source chain ID
     */
    function getProposalSourceChainID(
        bytes32 resourceID,
        uint256 amount,
        address depositer,
        address recipient
    ) external view returns (uint256);

    /**
     * @dev Check if a proposal has been executed
     * @param originChainID ID of the origin chain
     * @param depositNonce Nonce of the deposit
     * @return True if the proposal has been executed, false otherwise
     */
    function isProposalExecuted(uint256 originChainID, uint64 depositNonce) external view returns (bool);

    /**
     * @dev Returns the address of the current owner.
     */
    function owner() external view returns (address);
}
