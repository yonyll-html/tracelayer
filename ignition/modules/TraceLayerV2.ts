import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const TraceLayerV2Module = buildModule("TraceLayerV2Module", (m) => {
  const traceLayer = m.contract("TraceLayer");

  return { traceLayer };
});

export default TraceLayerV2Module;