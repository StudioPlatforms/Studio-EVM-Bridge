// SPDX-License-Identifier: MIT
pragma solidity 0.8.0;

import "./interfaces/IERC20.sol";
import "./security/Ownable.sol";
import "./security/ReentrancyGuard.sol";

/**
 * @title MockBridgeHandler
 * @dev A contract that mimics the real bridge handler for USDT
 * This contract allows the owner to simulate deposit events and transfer USDT
 * to specified addresses as if they were bridged from BSC to Studio
 */
contract MockBridgeHandler is Ownable, ReentrancyGuard {
    // USDT token contract address
    IERC20 public usdtToken;
    
    // Chain IDs
    uint256 public constant BSC_CHAIN_ID = 56;
    uint256 public constant STUDIO_CHAIN_ID = 240241; // Studio chain ID
    
    // Resource ID for USDT
    bytes32 public usdtResourceId;
    
    // Deposit nonce counter
    uint64 public depositNonce;
    
    // Events
    event Deposit(
        uint256 indexed destinationChainId,
        bytes32 indexed resourceID,
        uint64 indexed depositNonce,
        address depositer,
        bytes recipient,
        uint256 amount,
        bytes32 dataHash
    );
    
    event EmergencyWithdrawal(
        address indexed token,
        address indexed recipient,
        uint256 amount
    );

    /**
     * @dev Constructor
     * @param _usdtAddress Address of the USDT token contract
     * @param _usdtResourceId Resource ID for USDT
     */
    constructor(address _usdtAddress, bytes32 _usdtResourceId) {
        require(_usdtAddress != address(0), "MockBridgeHandler: invalid USDT address");
        usdtToken = IERC20(_usdtAddress);
        usdtResourceId = _usdtResourceId;
        depositNonce = 0;
    }

    /**
     * @dev Simulate a deposit event and transfer USDT to the recipient
     * @param amount Amount of USDT to transfer
     * @param recipient Address to receive the USDT
     */
    function simulateDeposit(uint256 amount, address recipient) external onlyOwner nonReentrant {
        require(recipient != address(0), "MockBridgeHandler: invalid recipient");
        require(amount > 0, "MockBridgeHandler: amount must be greater than 0");
        
        // Check if the contract has enough USDT
        uint256 contractBalance = usdtToken.balanceOf(address(this));
        require(contractBalance >= amount, "MockBridgeHandler: insufficient USDT balance");
        
        // Increment deposit nonce
        depositNonce++;
        
        // Encode recipient address for the event
        bytes memory recipientBytes = abi.encodePacked(recipient);
        
        // Create a data hash similar to the real bridge
        bytes memory proposalData = abi.encodePacked(
            usdtResourceId,
            abi.encode(amount, msg.sender, recipient)
        );
        bytes32 dataHash = keccak256(abi.encodePacked(address(this), proposalData));
        
        // Emit deposit event
        emit Deposit(
            STUDIO_CHAIN_ID,
            usdtResourceId,
            depositNonce,
            msg.sender,
            recipientBytes,
            amount,
            dataHash
        );
        
        // Transfer USDT to the recipient
        bool success = usdtToken.transfer(recipient, amount);
        require(success, "MockBridgeHandler: USDT transfer failed");
    }
    
    /**
     * @dev Emergency withdrawal of all USDT from the contract
     * @param recipient Address to receive the USDT
     */
    function emergencyWithdraw(address recipient) external onlyOwner nonReentrant {
        require(recipient != address(0), "MockBridgeHandler: invalid recipient");
        
        uint256 balance = usdtToken.balanceOf(address(this));
        require(balance > 0, "MockBridgeHandler: no USDT to withdraw");
        
        bool success = usdtToken.transfer(recipient, balance);
        require(success, "MockBridgeHandler: USDT transfer failed");
        
        emit EmergencyWithdrawal(address(usdtToken), recipient, balance);
    }
    
    /**
     * @dev Emergency withdrawal of a specific amount of USDT from the contract
     * @param recipient Address to receive the USDT
     * @param amount Amount of USDT to withdraw
     */
    function emergencyWithdrawAmount(address recipient, uint256 amount) external onlyOwner nonReentrant {
        require(recipient != address(0), "MockBridgeHandler: invalid recipient");
        require(amount > 0, "MockBridgeHandler: amount must be greater than 0");
        
        uint256 balance = usdtToken.balanceOf(address(this));
        require(balance >= amount, "MockBridgeHandler: insufficient USDT balance");
        
        bool success = usdtToken.transfer(recipient, amount);
        require(success, "MockBridgeHandler: USDT transfer failed");
        
        emit EmergencyWithdrawal(address(usdtToken), recipient, amount);
    }
    
    /**
     * @dev Update the USDT token address
     * @param _usdtAddress New USDT token address
     */
    function updateUsdtAddress(address _usdtAddress) external onlyOwner {
        require(_usdtAddress != address(0), "MockBridgeHandler: invalid USDT address");
        usdtToken = IERC20(_usdtAddress);
    }
    
    /**
     * @dev Update the USDT resource ID
     * @param _usdtResourceId New USDT resource ID
     */
    function updateUsdtResourceId(bytes32 _usdtResourceId) external onlyOwner {
        usdtResourceId = _usdtResourceId;
    }
}
