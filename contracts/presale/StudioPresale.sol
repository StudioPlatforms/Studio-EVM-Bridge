// SPDX-License-Identifier: MIT
pragma solidity 0.8.0;

import "../security/ReentrancyGuard.sol";
import "../security/Pausable.sol";
import "../security/Ownable.sol";
import "../interfaces/IERC20.sol";
import "../ERC20SafeFixed.sol";

/**
 * @title StudioPresale
 * @dev Contract for the Studio token presale
 * Modified to use ERC20SafeFixed for compatibility with non-standard ERC20 tokens like USDT
 * Features:
 * - Accept USDT deposits for STO tokens
 * - Dynamic pricing based on total raised
 * - Top 10 contributors get 1.5x tokens
 * - Vesting schedule: 20% immediate, 20% monthly for 4 months
 * - Emergency withdrawal with 20% penalty
 * - Refund capability if presale is canceled
 */
contract StudioPresale is ReentrancyGuard, Pausable, Ownable, ERC20SafeFixed {
    // USDT token address
    IERC20 public usdtToken;
    
    // Base token price in USDT (6 decimals)
    // 0.06 USDT per STO token = 60000 (with 6 decimals)
    uint256 public baseTokenPrice;
    
    // Final token price (calculated when presale is finalized)
    uint256 public finalTokenPrice;
    
    // Minimum purchase amount in USDT (6 decimals)
    // $50 = 50000000 (with 6 decimals)
    uint256 public minPurchaseAmount;
    
    // Target raise amount in USDT (6 decimals)
    // $1.2M = 1200000000000 (with 6 decimals)
    uint256 public targetRaiseAmount;
    
    // Total tokens allocated for presale (18 decimals)
    // 20M tokens = 20000000000000000000000000 (with 18 decimals)
    uint256 public totalTokensAllocated;
    
    // Presale status
    enum PresaleStatus { Active, FilledSuccessfully, Canceled }
    PresaleStatus public presaleStatus;
    
    // Total USDT raised (6 decimals)
    uint256 public totalRaised;
    
    // Number of unique contributors
    uint256 public contributorsCount;
    
    // Running total of base tokens needed (for gas optimization)
    uint256 public totalBaseTokensNeeded;
    
    // Vesting configuration
    uint256 public immediateClaim; // Percentage available immediately (20%)
    uint256 public vestingPeriods; // Number of vesting periods (4)
    uint256 public vestingDuration; // Duration of each vesting period in seconds (30 days)
    uint256 public presaleEndTime; // Timestamp when presale was marked filled/canceled
    
    // Leaderboard bonus multiplier (150 = 1.5x)
    uint256 public leaderboardBonusMultiplier = 150;
    
    // Number of top contributors for leaderboard
    uint256 public constant LEADERBOARD_SIZE = 10;
    
    // Gas limit for leaderboard updates
    uint256 private constant GAS_LIMIT_LEADERBOARD = 3000000;
    
    // STO balance tracking
    uint256 public stoBalance;
    
    // Contributor data
    struct Contributor {
        uint256 usdtContributed; // Amount of USDT contributed
        uint256 tokensWithdrawn; // Tokens already withdrawn
        uint256 lastClaimTime; // Last time tokens were claimed
        bool hasWithdrawn; // Whether the contributor has withdrawn in case of cancellation
        uint256 leaderboardPosition; // Position in leaderboard (0 if not in top 10)
    }
    
    // Mapping of contributor address to contributor data
    mapping(address => Contributor) public contributors;
    
    // Mapping to track unique contributors
    mapping(address => bool) public isContributor;
    
    // Array of all contributor addresses
    address[] public contributorsList;
    
    // Array of top contributors (sorted by contribution amount)
    address[LEADERBOARD_SIZE] public topContributors;
    
    // Events
    event Contribution(address indexed contributor, uint256 usdtAmount);
    event TokensClaimed(address indexed contributor, uint256 amount);
    event EmergencyWithdrawal(address indexed contributor, uint256 usdtAmount, uint256 penaltyAmount);
    event PresaleStatusChanged(PresaleStatus newStatus);
    event VestingParametersUpdated(uint256 immediateClaim, uint256 vestingPeriods, uint256 vestingDuration);
    event RefundClaimed(address indexed contributor, uint256 usdtAmount);
    event LeaderboardUpdated(address indexed contributor, uint256 position);
    event FundsWithdrawn(uint256 amount);
    event STODeposited(uint256 amount);
    event TokensRecovered(address token, uint256 amount);
    event NativeSTORecovered(uint256 amount);
    
    /**
     * @dev Constructor
     * @param _usdtToken USDT token address
     * @param _baseTokenPrice Base token price in USDT (6 decimals)
     * @param _minPurchaseAmount Minimum purchase amount in USDT (6 decimals)
     * @param _targetRaiseAmount Target raise amount in USDT (6 decimals)
     * @param _totalTokensAllocated Total tokens allocated for presale (18 decimals)
     */
    constructor(
        address _usdtToken,
        uint256 _baseTokenPrice,
        uint256 _minPurchaseAmount,
        uint256 _targetRaiseAmount,
        uint256 _totalTokensAllocated
    ) {
        usdtToken = IERC20(_usdtToken);
        baseTokenPrice = _baseTokenPrice;
        finalTokenPrice = _baseTokenPrice; // Initialize with base price
        minPurchaseAmount = _minPurchaseAmount;
        targetRaiseAmount = _targetRaiseAmount;
        totalTokensAllocated = _totalTokensAllocated;
        
        // Default vesting parameters
        immediateClaim = 20; // 20%
        vestingPeriods = 4; // 4 months
        vestingDuration = 30 days; // 30 days per period
        
        presaleStatus = PresaleStatus.Active;
    }
    
    /**
     * @dev Deposit STO tokens to the contract
     */
    function depositSTO() external payable onlyOwner {
        require(stoBalance + msg.value <= totalTokensAllocated, "Exceeds allocation");
        stoBalance += msg.value;
        emit STODeposited(msg.value);
    }
    
    /**
     * @dev Contribute USDT to the presale
     * @param usdtAmount Amount of USDT to contribute (6 decimals)
     */
    function contribute(uint256 usdtAmount) external nonReentrant whenNotPaused {
        // Validations
        require(presaleStatus == PresaleStatus.Active, "Presale is not active");
        require(usdtAmount >= minPurchaseAmount, "Contribution below minimum");
        
        // Calculate tokens at base price for cap check
        uint256 newTokenAmount = (usdtAmount * 1e18) / baseTokenPrice;
        uint256 newTotalBaseTokens = totalBaseTokensNeeded + newTokenAmount;
        
        // Calculate worst-case bonus tokens (if all top contributors get 1.5x)
        // Using most conservative approach: assume all tokens could get the bonus
        uint256 maxPossibleBonusTokens = (newTotalBaseTokens * LEADERBOARD_SIZE * 50) / 100;
        
        // Ensure we don't exceed total allocation
        require(newTotalBaseTokens + maxPossibleBonusTokens <= totalTokensAllocated, 
                "Exceeds token cap");
        
        // Update contributor data
        Contributor storage contributor = contributors[msg.sender];
        
        // If first time contributor, add to list
        if (!isContributor[msg.sender]) {
            contributorsList.push(msg.sender);
            contributorsCount++;
            isContributor[msg.sender] = true;
        }
        
        // Update contribution amounts
        contributor.usdtContributed += usdtAmount;
        
        // Update presale data
        totalRaised += usdtAmount;
        totalBaseTokensNeeded += newTokenAmount;
        
        // Always update leaderboard for accuracy
        updateLeaderboard(msg.sender, contributor.usdtContributed);
        
        // Transfer USDT from contributor to contract
        safeTransferFrom(usdtToken, msg.sender, address(this), usdtAmount);
        
        emit Contribution(msg.sender, usdtAmount);
    }
    
    /**
     * @dev Claim vested tokens
     */
    function claimTokens() external nonReentrant {
        require(presaleStatus == PresaleStatus.FilledSuccessfully, "Presale not successfully filled");
        
        Contributor storage contributor = contributors[msg.sender];
        require(contributor.usdtContributed > 0, "No contribution found");
        
        uint256 claimableAmount = getClaimableTokens(msg.sender);
        require(claimableAmount > 0, "No tokens available to claim");
        require(stoBalance >= claimableAmount, "Insufficient STO balance");
        
        contributor.tokensWithdrawn += claimableAmount;
        contributor.lastClaimTime = block.timestamp;
        
        // Update STO balance
        stoBalance -= claimableAmount;
        
        // Transfer native STO tokens to contributor
        (bool success, ) = msg.sender.call{value: claimableAmount}("");
        require(success, "Native token transfer failed");
        
        emit TokensClaimed(msg.sender, claimableAmount);
    }
    
    /**
     * @dev Safe multiplication followed by division to prevent intermediate overflow
     * @param x First multiplication operand
     * @param y Second multiplication operand
     * @param denominator Division operand
     * @return result (x * y) / denominator with 512-bit precision in the intermediate steps
     */
    function mulDiv(
        uint256 x,
        uint256 y,
        uint256 denominator
    ) internal pure returns (uint256 result) {
        unchecked {
            // 512-bit multiply [prod1 prod0] = x * y
            // prod1 is the high 256 bits, prod0 is the low 256 bits
            uint256 prod0; // low 256 bits
            uint256 prod1; // high 256 bits
            assembly {
                let mm := mulmod(x, y, not(0))
                prod0 := mul(x, y)
                prod1 := sub(sub(mm, prod0), lt(mm, prod0))
            }

            // Handle non-overflow cases, 256-bit division
            if (prod1 == 0) {
                require(denominator > 0, "denominator=0");
                assembly {
                    result := div(prod0, denominator)
                }
                return result;
            }

            // Make sure the result is less than 2^256.
            // Also prevents denominator == 0
            require(denominator > prod1, "overflow");

            ///////////////////////////////////////////////
            // 512 by 256 division.
            ///////////////////////////////////////////////

            // Make division exact by subtracting the remainder from [prod1 prod0].
            uint256 remainder;
            assembly {
                remainder := mulmod(x, y, denominator)
            }
            assembly {
                prod1 := sub(prod1, gt(remainder, prod0))
                prod0 := sub(prod0, remainder)
            }

            // Factor powers of two out of denominator
            // Compute largest power of two divisor of denominator (always >= 1)
            uint256 twos = denominator & (~denominator + 1);
            assembly {
                denominator := div(denominator, twos)
                prod0 := div(prod0, twos)
                twos := add(div(sub(0, twos), twos), 1)
            }
            prod0 |= prod1 * twos;

            // Invert denominator mod 2^256
            // (now that denominator is odd, it has an inverse modulo 2^256)
            uint256 inverse = (3 * denominator) ^ 2; // initial guess
            // Uses Newton's method to improve the precision
            inverse *= 2 - denominator * inverse; // 1st iteration
            inverse *= 2 - denominator * inverse; // 2nd iteration
            inverse *= 2 - denominator * inverse; // 3rd iteration
            inverse *= 2 - denominator * inverse; // 4th iteration
            inverse *= 2 - denominator * inverse; // 5th iteration
            inverse *= 2 - denominator * inverse; // 6th iteration

            // Because the division is now exact, we can multiply
            // [prod0 * inverse] to get the correct result.
            result = prod0 * inverse;
            return result;
        }
    }

    /**
     * @dev Emergency withdrawal with 20% penalty
     * Fixed to prevent overflow when calculating tokens to remove using safe mulDiv
     */
    function emergencyWithdraw() external nonReentrant {
        require(presaleStatus == PresaleStatus.Active, "Presale not active");
        
        Contributor storage contributor = contributors[msg.sender];
        require(contributor.usdtContributed > 0, "No contribution found");
        
        uint256 withdrawAmount = contributor.usdtContributed;
        uint256 penaltyAmount = withdrawAmount * 20 / 100; // 20% penalty
        uint256 returnAmount = withdrawAmount - penaltyAmount;
        
        // Calculate tokens to remove from totalBaseTokensNeeded
        // Use safe mulDiv to prevent overflow
        uint256 tokensToRemove = 0;
        if (totalBaseTokensNeeded > 0 && totalRaised > 0) {
            tokensToRemove = mulDiv(totalBaseTokensNeeded, withdrawAmount, totalRaised);
            
            // Make sure we don't remove more than totalBaseTokensNeeded
            if (tokensToRemove > totalBaseTokensNeeded) {
                tokensToRemove = totalBaseTokensNeeded;
            }
            
            // Safely update totalBaseTokensNeeded
            totalBaseTokensNeeded -= tokensToRemove;
        }
        
        // Reset contributor's contribution amount but keep them as a contributor
        contributor.usdtContributed = 0;
        
        // Update presale data
        totalRaised -= withdrawAmount;
        
        // Always update leaderboard for accuracy
        updateLeaderboard(msg.sender, 0);
        
        // Transfer penalty to owner
        safeTransfer(usdtToken, owner(), penaltyAmount);
        
        // Transfer USDT back to contributor (minus penalty)
        safeTransfer(usdtToken, msg.sender, returnAmount);
        
        emit EmergencyWithdrawal(msg.sender, returnAmount, penaltyAmount);
    }
    
    /**
     * @dev Claim refund if presale is canceled
     */
    function claimRefund() external nonReentrant {
        require(presaleStatus == PresaleStatus.Canceled, "Presale not canceled");
        
        Contributor storage contributor = contributors[msg.sender];
        require(contributor.usdtContributed > 0, "No contribution found");
        require(!contributor.hasWithdrawn, "Already withdrawn");
        
        uint256 refundAmount = contributor.usdtContributed;
        contributor.hasWithdrawn = true;
        
        // Transfer USDT back to contributor
        safeTransfer(usdtToken, msg.sender, refundAmount);
        
        emit RefundClaimed(msg.sender, refundAmount);
    }
    
    /**
     * @dev Finalize presale
     * @param successful Whether the presale was successful
     */
    function finalizePresale(bool successful) external onlyOwner {
        require(presaleStatus == PresaleStatus.Active, "Presale not active");
        
        if (successful) {
            // Check if contract has enough STO balance
            require(stoBalance >= totalTokensAllocated, "Insufficient STO balance");
            
            presaleStatus = PresaleStatus.FilledSuccessfully;
            
            // Calculate bonus tokens for top 10
            uint256 bonusTokensNeeded = 0;
            for (uint256 i = 0; i < LEADERBOARD_SIZE; i++) {
                if (topContributors[i] == address(0)) break;
                
                uint256 usdtAmount = contributors[topContributors[i]].usdtContributed;
                uint256 baseTokens = (usdtAmount * 1e18) / baseTokenPrice;
                bonusTokensNeeded += baseTokens * 50 / 100; // 50% bonus (1.5x total)
            }
            
            // Calculate final price based on total raised
            if (totalRaised <= targetRaiseAmount) {
                finalTokenPrice = baseTokenPrice;
            } else {
                // Scale price proportionally when exceeding target
                finalTokenPrice = (baseTokenPrice * totalRaised) / targetRaiseAmount;
            }
            
            // Ensure we don't exceed total allocation
            uint256 totalTokensNeeded = totalBaseTokensNeeded + bonusTokensNeeded;
            if (totalTokensNeeded > totalTokensAllocated) {
                // Adjust price to fit within allocation
                finalTokenPrice = (finalTokenPrice * totalTokensNeeded) / totalTokensAllocated;
            }
        } else {
            presaleStatus = PresaleStatus.Canceled;
        }
        
        presaleEndTime = block.timestamp;
        emit PresaleStatusChanged(presaleStatus);
    }
    
    /**
     * @dev Update vesting parameters
     * @param _immediateClaim Percentage available immediately
     * @param _vestingPeriods Number of vesting periods
     * @param _vestingDuration Duration of each vesting period in seconds
     */
    function updateVestingParameters(
        uint256 _immediateClaim,
        uint256 _vestingPeriods,
        uint256 _vestingDuration
    ) external onlyOwner {
        require(presaleStatus == PresaleStatus.Active, "Presale not active");
        require(_immediateClaim <= 100, "Immediate claim percentage too high");
        require(_vestingPeriods > 0, "Vesting periods must be positive");
        
        immediateClaim = _immediateClaim;
        vestingPeriods = _vestingPeriods;
        vestingDuration = _vestingDuration;
        
        emit VestingParametersUpdated(_immediateClaim, _vestingPeriods, _vestingDuration);
    }
    
    /**
     * @dev Withdraw funds after successful presale
     */
    function withdrawFunds() external onlyOwner {
        require(presaleStatus == PresaleStatus.FilledSuccessfully, "Presale not successfully filled");
        
        uint256 balance = usdtToken.balanceOf(address(this));
        require(balance > 0, "No funds to withdraw");
        
        safeTransfer(usdtToken, owner(), balance);
        
        emit FundsWithdrawn(balance);
    }
    
    /**
     * @dev Recover accidentally sent ERC20 tokens
     * @param token Address of the token to recover
     * @param amount Amount to recover
     */
    function recoverERC20(address token, uint256 amount) external onlyOwner {
        require(token != address(usdtToken), "Cannot recover USDT");
        IERC20(token).transfer(owner(), amount);
        emit TokensRecovered(token, amount);
    }
    
    /**
     * @dev Recover excess native STO tokens
     */
    function recoverNativeSTO() external onlyOwner {
        require(presaleStatus != PresaleStatus.Active, "Presale still active");
        
        uint256 excessAmount = address(this).balance - stoBalance;
        require(excessAmount > 0, "No excess STO to recover");
        
        (bool success, ) = owner().call{value: excessAmount}("");
        require(success, "Transfer failed");
        
        emit NativeSTORecovered(excessAmount);
    }
    
    /**
     * @dev Emergency drain contract - withdraw all tokens (native and ERC20) from the contract
     * This function is for emergency use only and will drain the entire contract
     */
    function emergencyDrainContract() external onlyOwner {
        // Withdraw all native tokens (STO)
        uint256 nativeBalance = address(this).balance;
        if (nativeBalance > 0) {
            // Reset STO balance tracking
            stoBalance = 0;
            
            // Transfer all native tokens to owner
            (bool success, ) = owner().call{value: nativeBalance}("");
            require(success, "Native token transfer failed");
            
            emit NativeSTORecovered(nativeBalance);
        }
        
        // Withdraw all USDT tokens
        uint256 usdtBalance = usdtToken.balanceOf(address(this));
        if (usdtBalance > 0) {
            // Transfer all USDT to owner
            safeTransfer(usdtToken, owner(), usdtBalance);
            
            emit FundsWithdrawn(usdtBalance);
        }
        
        // Reset presale status to canceled if it's active
        if (presaleStatus == PresaleStatus.Active) {
            presaleStatus = PresaleStatus.Canceled;
            presaleEndTime = block.timestamp;
            emit PresaleStatusChanged(presaleStatus);
        }
    }
    
    /**
     * @dev Pause the presale
     */
    function pause() external onlyOwner {
        _pause();
    }
    
    /**
     * @dev Unpause the presale
     */
    function unpause() external onlyOwner {
        _unpause();
    }
    
    /**
     * @dev Update leaderboard when contribution changes
     * @param contributor Contributor address
     * @param newAmount New contribution amount
     */
    function updateLeaderboard(address contributor, uint256 newAmount) internal {
        // Get current position (0 if not in leaderboard)
        uint256 currentPosition = contributors[contributor].leaderboardPosition;
        
        // If contributor is currently in leaderboard, remove them
        if (currentPosition > 0) {
            // Shift everyone up one position
            for (uint256 i = currentPosition; i < LEADERBOARD_SIZE; i++) {
                if (i == LEADERBOARD_SIZE - 1) {
                    topContributors[i] = address(0);
                } else {
                    topContributors[i] = topContributors[i + 1];
                    if (topContributors[i] != address(0)) {
                        contributors[topContributors[i]].leaderboardPosition = i + 1;
                    }
                }
            }
            
            // Reset contributor's position
            contributors[contributor].leaderboardPosition = 0;
        }
        
        // If new amount is 0, just return (contributor is removed from leaderboard)
        if (newAmount == 0) {
            return;
        }
        
        // Find new position in leaderboard
        uint256 newPosition = 0;
        for (uint256 i = 0; i < LEADERBOARD_SIZE; i++) {
            // If we've reached an empty slot or a contributor with less contribution
            if (topContributors[i] == address(0) || 
                contributors[topContributors[i]].usdtContributed < newAmount) {
                newPosition = i + 1; // Position is 1-indexed
                break;
            }
        }
        
        // If not in top LEADERBOARD_SIZE, return
        if (newPosition == 0) {
            return;
        }
        
        // Shift everyone down one position
        for (uint256 i = LEADERBOARD_SIZE - 1; i > newPosition - 1; i--) {
            topContributors[i] = topContributors[i - 1];
            if (topContributors[i] != address(0)) {
                contributors[topContributors[i]].leaderboardPosition = i + 1;
            }
        }
        
        // Insert contributor at new position
        topContributors[newPosition - 1] = contributor;
        contributors[contributor].leaderboardPosition = newPosition;
        
        emit LeaderboardUpdated(contributor, newPosition);
    }
    
    /**
     * @dev Get claimable tokens for a contributor
     * @param contributor Contributor address
     * @return Claimable token amount
     */
    function getClaimableTokens(address contributor) public view returns (uint256) {
        Contributor storage c = contributors[contributor];
        
        // If presale not filled or no contribution, return 0
        if (presaleStatus != PresaleStatus.FilledSuccessfully || c.usdtContributed == 0) {
            return 0;
        }
        
        // Calculate base tokens using final price
        uint256 baseTokens = (c.usdtContributed * 1e18) / finalTokenPrice;
        
        // Apply leaderboard bonus if in top LEADERBOARD_SIZE
        if (c.leaderboardPosition > 0) {
            baseTokens = (baseTokens * leaderboardBonusMultiplier) / 100;
        }
        
        // If no vesting periods have passed, only immediate claim is available
        if (block.timestamp < presaleEndTime) {
            return 0;
        }
        
        // Calculate vested percentage
        uint256 vestedPercentage = immediateClaim; // Start with immediate claim
        
        // Calculate additional vesting based on time elapsed
        uint256 timeElapsed = block.timestamp - presaleEndTime;
        uint256 periodsPassed = timeElapsed / vestingDuration;
        
        // Cap periods passed to vestingPeriods
        if (periodsPassed > vestingPeriods) {
            periodsPassed = vestingPeriods;
        }
        
        // Each period adds (100 - immediateClaim) / vestingPeriods percentage
        if (periodsPassed > 0) {
            vestedPercentage += (periodsPassed * (100 - immediateClaim)) / vestingPeriods;
        }
        
        // Cap at 100%
        if (vestedPercentage > 100) {
            vestedPercentage = 100;
        }
        
        // Calculate vested tokens
        uint256 vestedTokens = (baseTokens * vestedPercentage) / 100;
        
        // Subtract already withdrawn tokens
        if (vestedTokens <= c.tokensWithdrawn) {
            return 0;
        }
        
        return vestedTokens - c.tokensWithdrawn;
    }
    
    /**
     * @dev Get presale stats
     * @return _totalRaised Total USDT raised
     * @return _contributorsCount Number of unique contributors
     * @return _finalTokenPrice Final token price
     * @return _presaleStatus Current presale status
     */
    function getPresaleStats() external view returns (
        uint256 _totalRaised,
        uint256 _contributorsCount,
        uint256 _finalTokenPrice,
        PresaleStatus _presaleStatus
    ) {
        return (totalRaised, contributorsCount, finalTokenPrice, presaleStatus);
    }
    
    /**
     * @dev Get contributor info
     * @param contributor Contributor address
     * @return _usdtContributed Amount of USDT contributed
     * @return _tokensWithdrawn Tokens already withdrawn
     * @return _leaderboardPosition Position in leaderboard (0 if not in top 10)
     * @return _claimableTokens Tokens available to claim
     */
    function getContributorInfo(address contributor) external view returns (
        uint256 _usdtContributed,
        uint256 _tokensWithdrawn,
        uint256 _leaderboardPosition,
        uint256 _claimableTokens
    ) {
        Contributor storage c = contributors[contributor];
        return (
            c.usdtContributed,
            c.tokensWithdrawn,
            c.leaderboardPosition,
            getClaimableTokens(contributor)
        );
    }
    
    /**
     * @dev Get leaderboard
     * @return _addresses Array of top contributor addresses
     * @return _amounts Array of contribution amounts
     */
    function getLeaderboard() external view returns (
        address[LEADERBOARD_SIZE] memory _addresses,
        uint256[LEADERBOARD_SIZE] memory _amounts
    ) {
        for (uint256 i = 0; i < LEADERBOARD_SIZE; i++) {
            _addresses[i] = topContributors[i];
            if (_addresses[i] != address(0)) {
                _amounts[i] = contributors[_addresses[i]].usdtContributed;
            } else {
                _amounts[i] = 0;
            }
        }
        return (_addresses, _amounts);
    }
    
    /**
     * @dev Get vesting schedule
     * @return _immediateClaim Percentage available immediately
     * @return _vestingPeriods Number of vesting periods
     * @return _vestingDuration Duration of each vesting period in seconds
     * @return _presaleEndTime Timestamp when presale was marked filled/canceled
     */
    function getVestingSchedule() external view returns (
        uint256 _immediateClaim,
        uint256 _vestingPeriods,
        uint256 _vestingDuration,
        uint256 _presaleEndTime
    ) {
        return (immediateClaim, vestingPeriods, vestingDuration, presaleEndTime);
    }
    
    /**
     * @dev Receive function to accept native tokens
     * Disallowed to ensure all deposits go through depositSTO()
     */
    receive() external payable {
        revert("Use depositSTO() for STO deposits");
    }
}
