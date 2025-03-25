// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

contract Multicall {
    error CallFailed();
    error InsufficientValue();

    /// @notice Performs multiple ETH transfers in a single transaction
    /// @param targets Array of addresses to send ETH to
    /// @param values Array of ETH amounts to send to each address
    /// @param data Array of calldata for each call (can be empty bytes for simple transfers)
    /// @return results Array of boolean indicating success of each transfer
    function multiCall(
        address[] calldata targets,
        uint256[] calldata values,
        bytes[] calldata data
    ) external payable returns (bool[] memory results) {
        // Check array lengths match
        if (targets.length != values.length || targets.length != data.length) {
            revert("Array lengths must match");
        }

        // Check if enough ETH was sent
        uint256 totalValue;
        for (uint256 i = 0; i < values.length; i++) {
            totalValue += values[i];
        }
        if (msg.value < totalValue) {
            revert InsufficientValue();
        }

        results = new bool[](targets.length);
        
        // Perform calls
        for (uint256 i = 0; i < targets.length; i++) {
            (bool success, ) = targets[i].call{value: values[i]}(data[i]);
            results[i] = success;

            if (!success) {
                revert CallFailed();
            }
        }

        // Return any excess ETH
        uint256 remaining = msg.value - totalValue;
        if (remaining > 0) {
            (bool success, ) = msg.sender.call{value: remaining}("");
            if (!success) {
                revert CallFailed();
            }
        }
    }

    // Allow the contract to receive ETH
    receive() external payable {}
}