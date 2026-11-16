import { defineRailway, project, service, volume } from "railway/iac";

export default defineRailway(() => {
  const closeosData = volume("closeos-data", {
    alerts: { usage: { "100": {}, "80": {}, "95": {} } },
    allowOnlineResize: true,
    region: "europe-west4-drams3a",
    sizeMB: 1000,
  });
  const closeosApi = service("closeos-api", {
    build: {
      buildEnvironment: "V3",
      builder: "DOCKERFILE",
      dockerfilePath: "Dockerfile",
    },
    healthcheck: "/api/health",
    healthcheckTimeout: 120,
    replicas: { "europe-west4-drams3a": 1 },
    volumeMounts: { "/data": closeosData },
  });

  return project("closeos", {
    variables: { managed: false },
    resources: [closeosApi, closeosData],
  });
});
