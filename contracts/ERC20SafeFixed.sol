// SPDX-License-Identifier: MIT
pragma solidity 0.8.0;

import "./interfaces/IERC20.sol";

/**
 * @title ERC20SafeFixed
 * @dev Contract to safely interact with ERC20 tokens, including non-standard ones like USDT
 */
contract ERC20SafeFixed {
    /**
     * @dev Safely transfers ERC20 tokens from one address to another
     * @param token The address of the ERC20 token
     * @param from The address to transfer from
     * @param to The address to transfer to
     * @param amount The amount to transfer
     */
    function safeTransferFrom(
        IERC20 token,
        address from,
        address to,
        uint256 amount
    ) internal {
        (bool success, bytes memory returnData) = address(token).call(
            abi.encodeWithSelector(IERC20.transferFrom.selector, from, to, amount)
        );
        require(success, "ERC20SafeFixed: transferFrom call reverted");

        // If it returned any data at all, we expect a single bool.
        if (returnData.length > 0) {
            // Old USDT returns empty data on success, so only decode if there is data
            require(abi.decode(returnData, (bool)), "ERC20SafeFixed: transferFrom returned false");
        }
    }

    /**
     * @dev Safely transfers ERC20 tokens to an address
     * @param token The address of the ERC20 token
     * @param to The address to transfer to
     * @param amount The amount to transfer
     */
    function safeTransfer(
        IERC20 token,
        address to,
        uint256 amount
    ) internal {
        (bool success, bytes memory returnData) = address(token).call(
            abi.encodeWithSelector(IERC20.transfer.selector, to, amount)
        );
        require(success, "ERC20SafeFixed: transfer call reverted");

        // If it returned any data at all, we expect a single bool.
        if (returnData.length > 0) {
            // Old USDT returns empty data on success, so only decode if there is data
            require(abi.decode(returnData, (bool)), "ERC20SafeFixed: transfer returned false");
        }
    }
}
