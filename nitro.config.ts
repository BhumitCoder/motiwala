import { defineNitroConfig } from "nitro/config";

export default defineNitroConfig({
  preset: "vercel",
  vercel: {
    functions: {
      runtime: "nodejs22.x",
    },
  },
});
