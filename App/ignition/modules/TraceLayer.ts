import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const TraceLayerModule = buildModule("TraceLayerModule", (m) => {
  const traceLayer = m.contract("TraceLayer");

  return { traceLayer };
});

export default TraceLayerModule;
