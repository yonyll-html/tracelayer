// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title TraceLayer
/// @notice Educational supply-chain traceability prototype.
contract TraceLayer {
    address public owner;
    address public relayer;

    struct Batch {
        string productName;
        string origin;
        string currentLocation;
        string status;
        string currentCustodian;
        uint256 createdAt;
        bool exists;
    }

    struct Transfer {
        string fromLocation;
        string toLocation;
        string status;
        uint256 timestamp;
        string operatorId;
        string fromCustodian;
        string toCustodian;
    }

    mapping(string => Batch) private batches;
    mapping(string => Transfer[]) private transferHistory;
    mapping(string => uint256) public transferNonces;

    event RelayerChanged(
        address indexed previousRelayer,
        address indexed newRelayer
    );

    event BatchRegistered(
        string indexed batchId,
        string productName,
        string origin,
        string custodianId
    );

    event TransferRecorded(
        string indexed batchId,
        string indexed operatorId,
        uint256 timestamp
    );

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    modifier onlyRelayer() {
        require(msg.sender == relayer, "Only authorized relayer");
        _;
    }

    constructor() {
        owner = msg.sender;
        relayer = msg.sender;
    }

    function setRelayer(address newRelayer) external onlyOwner {
        require(newRelayer != address(0), "Invalid relayer address");

        address previousRelayer = relayer;
        relayer = newRelayer;

        emit RelayerChanged(previousRelayer, newRelayer);
    }

    function isAllowedOrganization(
        string memory organizationId
    ) public pure returns (bool) {
        bytes32 organizationHash = keccak256(bytes(organizationId));

        return
            organizationHash == keccak256(bytes("green-valley-farms")) ||
            organizationHash == keccak256(bytes("freshroute-distribution")) ||
            organizationHash == keccak256(bytes("harvest-market"));
    }

    function registerBatch(
        string calldata batchId,
        string calldata productName,
        string calldata origin,
        string calldata custodianId
    ) external onlyRelayer {
        require(bytes(batchId).length > 0, "Batch ID required");
        require(bytes(productName).length > 0, "Product name required");
        require(bytes(origin).length > 0, "Origin required");
        require(bytes(custodianId).length > 0, "Custodian ID required");
        require(isAllowedOrganization(custodianId), "Unrecognized custodian");
        require(!batches[batchId].exists, "Batch already exists");

        batches[batchId] = Batch({
            productName: productName,
            origin: origin,
            currentLocation: origin,
            status: "Registered",
            currentCustodian: custodianId,
            createdAt: block.timestamp,
            exists: true
        });

        emit BatchRegistered(
            batchId,
            productName,
            origin,
            custodianId
        );
    }

    function recordTransfer(
        string calldata batchId,
        string calldata operatorId,
        string calldata currentCustodian,
        string calldata toLocation,
        string calldata status,
        string calldata newCustodian,
        uint256 expectedNonce
    ) external onlyRelayer {
        require(batches[batchId].exists, "Batch does not exist");
        require(bytes(operatorId).length > 0, "Operator ID required");
        require(bytes(currentCustodian).length > 0, "Custodian ID required");
        require(bytes(toLocation).length > 0, "Destination required");
        require(bytes(status).length > 0, "Status required");
        require(bytes(newCustodian).length > 0, "New custodian required");

        require(
            isAllowedOrganization(currentCustodian),
            "Unrecognized current custodian"
        );

        require(
            isAllowedOrganization(newCustodian),
            "Unrecognized new custodian"
        );

        Batch storage batch = batches[batchId];

        require(
            keccak256(bytes(currentCustodian)) ==
                keccak256(bytes(batch.currentCustodian)),
            "Not the current custodian"
        );

        require(
            keccak256(bytes(newCustodian)) !=
                keccak256(bytes(batch.currentCustodian)),
            "Already the current custodian"
        );

        require(
            expectedNonce == transferNonces[batchId],
            "Invalid transfer nonce"
        );

        string memory fromLocation = batch.currentLocation;

        transferHistory[batchId].push(
            Transfer({
                fromLocation: fromLocation,
                toLocation: toLocation,
                status: status,
                timestamp: block.timestamp,
                operatorId: operatorId,
                fromCustodian: batch.currentCustodian,
                toCustodian: newCustodian
            })
        );

        transferNonces[batchId]++;

        batch.currentLocation = toLocation;
        batch.status = status;
        batch.currentCustodian = newCustodian;

        emit TransferRecorded(
            batchId,
            operatorId,
            block.timestamp
        );
    }

    function getBatch(
        string calldata batchId
    ) external view returns (Batch memory) {
        require(batches[batchId].exists, "Batch does not exist");
        return batches[batchId];
    }

    function getTransferCount(
        string calldata batchId
    ) external view returns (uint256) {
        require(batches[batchId].exists, "Batch does not exist");
        return transferHistory[batchId].length;
    }

    function getTransferAt(
        string calldata batchId,
        uint256 index
    ) external view returns (Transfer memory) {
        require(batches[batchId].exists, "Batch does not exist");
        require(
            index < transferHistory[batchId].length,
            "Transfer index out of bounds"
        );

        return transferHistory[batchId][index];
    }

    function getTransferHistory(
        string calldata batchId
    ) external view returns (Transfer[] memory) {
        require(batches[batchId].exists, "Batch does not exist");
        return transferHistory[batchId];
    }
}